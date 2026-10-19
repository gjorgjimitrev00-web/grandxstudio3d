import { Prisma, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { cartSchema, checkoutSchema } from './validation';
import { HttpError, hash, orderToken } from './security';
import {
  rewardsSettings,
  eligibleGift,
  giftProductInclude,
  postPoints,
  settleOrderRewards,
} from './rewards';
import { discountLimit, earnedPoints, type RewardSelection } from './rewards-rules';
type Tx = Prisma.TransactionClient;
async function quoteProducts(tx: Tx, items: z.infer<typeof cartSchema>, shippingMethodId: string) {
  const products = await tx.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, published: true },
    include: {
      variants: { include: { values: { include: { value: { include: { option: true } } } } } },
      options: { include: { values: true } },
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
    },
  });
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId || ''}`;
    totals.set(key, (totals.get(key) || 0) + item.quantity);
  }
  const lines = items.map((item) => {
    const p = products.find((p) => p.id === item.productId);
    if (!p) throw new HttpError(400, 'A product is no longer available.');
    if (p.inventoryMode === 'OUT_OF_STOCK') throw new HttpError(400, `${p.name}: out of stock.`);
    const v = item.variantId
      ? p.variants.find((v) => v.id === item.variantId && v.enabled)
      : undefined;
    if ((p.variants.length && !v) || (!p.variants.length && item.variantId))
      throw new HttpError(400, `${p.name}: select an available variant.`);
    const requested = totals.get(`${p.id}:${v?.id || ''}`)!;
    if (p.trackInventory && (v ? v.stock : p.stock) < requested)
      throw new HttpError(400, `${p.name}: insufficient stock.`);
    const unitPrice = v?.price ?? (p.salePrice ?? p.price) + (v?.priceAdjustment ?? 0);
    if (unitPrice < 0 || unitPrice > 10000000) throw new HttpError(400, 'Invalid product price.');
    const selections: { optionName: string; value: string }[] = [];
    for (const key of Object.keys(item.options))
      if (!p.options.some((o) => o.id === key))
        throw new HttpError(400, 'An option is no longer available.');
    for (const option of p.options) {
      const fromVariant = v?.values.find((x) => x.value.optionId === option.id)?.value;
      const chosen = fromVariant?.value || item.options[option.id] || '';
      if (option.required && !chosen) throw new HttpError(400, `${option.name} is required.`);
      if (chosen && option.kind === 'SELECT' && !option.values.some((x) => x.value === chosen))
        throw new HttpError(400, `Invalid ${option.name}.`);
      if (fromVariant && item.options[option.id] && item.options[option.id] !== fromVariant.value)
        throw new HttpError(400, 'Variant and option do not match.');
      if (chosen) selections.push({ optionName: option.name, value: chosen });
    }
    return {
      productId: p.id,
      variantId: v?.id ?? null,
      name: p.name,
      sku: v?.sku ?? p.sku,
      variantName: v?.name ?? null,
      image: v?.image || p.images[0]?.thumbnailUrl || null,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice * item.quantity,
      madeToOrder: p.inventoryMode === 'MADE_TO_ORDER',
      stockDeducted: p.trackInventory,
      rewardGift: false,
      selections,
    };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const method = await tx.shippingMethod.findUnique({ where: { id: shippingMethodId } });
  if (!method?.enabled || method.country !== 'MK')
    throw new HttpError(400, 'Select an available shipping method.');
  if (method.kind === 'FREE' && method.freeThreshold !== null && subtotal < method.freeThreshold)
    throw new HttpError(400, 'The free shipping minimum has not been reached.');
  const shipping =
    method.kind === 'PICKUP' ||
    method.kind === 'FREE' ||
    (method.freeThreshold !== null && subtotal >= method.freeThreshold)
      ? 0
      : method.price;
  return { lines, subtotal, shipping, total: subtotal + shipping, shippingName: method.name };
}
export async function quoteCart(
  tx: Tx,
  items: z.infer<typeof cartSchema>,
  shippingMethodId: string,
  userId?: string,
  selection: RewardSelection = { discountPoints: 0, giftId: '' },
) {
  const quote = await quoteProducts(tx, items, shippingMethodId);
  const settings = await rewardsSettings(tx);
  const account = userId ? await tx.rewardsAccount.findUnique({ where: { userId } }) : null;
  const balance = account?.balance || 0;
  if ((selection.discountPoints || selection.giftId) && (!userId || !settings.enabled))
    throw new HttpError(400, userId ? 'Rewards are currently paused.' : 'Sign in to use rewards.');
  let giftPoints = 0;
  if (selection.giftId) {
    const gift = await tx.rewardGift.findUnique({
      where: { id: selection.giftId },
      include: { product: { include: giftProductInclude } },
    });
    if (!gift?.enabled || !eligibleGift(gift.product))
      throw new HttpError(409, 'This reward gift is no longer available. Choose another gift.');
    if (quote.subtotal <= 0) throw new HttpError(400, 'Add a paid product to claim a gift.');
    // Revalidate combined quantities so a gift cannot oversell the same product in the cart.
    const combined = await quoteProducts(
      tx,
      [...items, { productId: gift.productId, quantity: 1, options: {} }],
      shippingMethodId,
    );
    const giftLine = combined.lines[combined.lines.length - 1];
    quote.lines.push({ ...giftLine, unitPrice: 0, subtotal: 0, rewardGift: true });
    giftPoints = gift.points;
  }
  const maxDiscount = discountLimit(
    quote.subtotal,
    balance - giftPoints,
    settings.maxDiscountPercent,
  );
  if (
    selection.discountPoints &&
    (selection.discountPoints < settings.minimumDiscountPoints ||
      selection.discountPoints > maxDiscount)
  )
    throw new HttpError(
      400,
      `Use at least ${settings.minimumDiscountPoints} points, up to ${maxDiscount} points for this order.`,
    );
  if (selection.discountPoints + giftPoints > Math.max(0, balance))
    throw new HttpError(409, 'Not enough available points for these rewards.');
  const rewardDiscount = selection.discountPoints;
  const pointsEarned =
    userId && settings.enabled
      ? earnedPoints(quote.subtotal - rewardDiscount, settings.earnEveryMkd)
      : 0;
  return {
    ...quote,
    total: quote.total - rewardDiscount,
    rewardDiscount,
    giftPoints,
    pointsEarned,
    earnEveryMkd: settings.earnEveryMkd,
    rewardsUserId: userId && settings.enabled ? userId : null,
    rewards: {
      enabled: settings.enabled,
      balance,
      maxDiscount,
      minimumDiscountPoints: settings.minimumDiscountPoints,
    },
  };
}
export async function serializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === 'P2034' || e.code === 'P2002') &&
        attempt < 3
      )
        continue;
      throw e;
    }
  }
  throw Error('Transaction failed');
}
export async function createOrder(raw: unknown, userId?: string) {
  const input = checkoutSchema.parse(raw);
  const token = orderToken(input.idempotencyKey);
  const order = await serializable(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { customer: { select: { userId: true } } },
    });
    if (existing) {
      if (existing.customer.userId !== (userId || null))
        throw new HttpError(409, 'Checkout session changed. Please refresh your cart.');
      return existing;
    }
    const quote = await quoteCart(tx, input.items, input.shippingMethodId, userId, input.rewards);
    for (const line of quote.lines) {
      if (!line.stockDeducted) continue;
      const result = line.variantId
        ? await tx.productVariant.updateMany({
            where: { id: line.variantId, enabled: true, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          })
        : await tx.product.updateMany({
            where: { id: line.productId, published: true, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          });
      if (result.count !== 1) throw new HttpError(409, 'Stock changed. Please review your cart.');
    }
    let customer = userId
      ? await tx.customer.findUnique({ where: { userId } })
      : await tx.customer.findFirst({
          where: { email: input.email, phone: input.phone, userId: null },
        });
    const customerData = {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
    };
    customer = customer
      ? await tx.customer.update({ where: { id: customer.id }, data: customerData })
      : await tx.customer.create({ data: { ...customerData, userId } });
    const year = Number(
      new Intl.DateTimeFormat('en', { timeZone: 'Europe/Skopje', year: 'numeric' }).format(
        new Date(),
      ),
    );
    const sequence = await tx.orderSequence.upsert({
      where: { year },
      create: { year, value: 1 },
      update: { value: { increment: 1 } },
    });
    const number = `GX-${year}-${String(sequence.value).padStart(6, '0')}`;
    const { items, idempotencyKey, acceptTerms, rewards, ...address } = input;
    void items;
    void acceptTerms;
    void rewards;
    const created = await tx.order.create({
      data: {
        ...address,
        idempotencyKey,
        number,
        accessTokenHash: hash(token),
        customerId: customer.id,
        subtotal: quote.subtotal,
        shipping: quote.shipping,
        total: quote.total,
        shippingName: quote.shippingName,
        rewardDiscount: quote.rewardDiscount,
        giftPoints: quote.giftPoints,
        pointsEarned: quote.pointsEarned,
        earnEveryMkd: quote.earnEveryMkd,
        rewardsUserId: quote.rewardsUserId,
        items: {
          create: quote.lines.map(({ selections, ...line }) => ({
            ...line,
            selections: { create: selections },
          })),
        },
        history: { create: { status: 'NEW', note: 'Cash on Delivery order received.' } },
      },
    });
    if (userId)
      await postPoints(tx, {
        userId,
        points: -(quote.rewardDiscount + quote.giftPoints),
        eventKey: `order:${created.id}:redeemed`,
        kind: 'REDEEMED',
        orderId: created.id,
        note: `Checkout rewards · ${created.number}`,
      });
    return created;
  });
  return { order, token };
}
export const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'READY', 'CANCELLED'],
  IN_PRODUCTION: ['READY', 'CANCELLED'],
  READY: ['SHIPPED', 'DELIVERED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
export async function updateOrderStatus(id: string, status: OrderStatus, internalNotes: string) {
  return serializable(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      include: { items: true, shippingMethod: true },
    });
    if (!order) throw new HttpError(404, 'Order not found.');
    if (status !== order.status && !statusTransitions[order.status].includes(status))
      throw new HttpError(400, 'Invalid order status transition.');
    if (
      status === 'DELIVERED' &&
      order.status === 'READY' &&
      order.shippingMethod.kind !== 'PICKUP'
    )
      throw new HttpError(400, 'Ship this order before marking delivered.');
    if (status === 'CANCELLED' && !order.stockRestored) {
      for (const i of order.items) {
        if (!i.stockDeducted) continue;
        if (i.variantId)
          await tx.productVariant.update({
            where: { id: i.variantId },
            data: { stock: { increment: i.quantity } },
          });
        else if (i.productId)
          await tx.product.update({
            where: { id: i.productId },
            data: { stock: { increment: i.quantity } },
          });
      }
    }
    const updated = await tx.order.update({
      where: { id },
      data: {
        status,
        internalNotes,
        ...(status === 'DELIVERED' && order.status !== 'DELIVERED'
          ? { deliveredAt: new Date() }
          : {}),
        stockRestored: status === 'CANCELLED' || order.stockRestored,
        ...(status !== order.status ? { history: { create: { status } } } : {}),
      },
    });
    return settleOrderRewards(tx, updated);
  });
}

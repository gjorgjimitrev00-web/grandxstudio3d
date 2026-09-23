import { Prisma, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { cartSchema, checkoutSchema } from './validation';
import { HttpError, hash, orderToken } from './security';
type Tx = Prisma.TransactionClient;
export async function quoteCart(
  tx: Tx,
  items: z.infer<typeof cartSchema>,
  shippingMethodId: string,
) {
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
    const existing = await tx.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const quote = await quoteCart(tx, input.items, input.shippingMethodId);
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
    const { items, idempotencyKey, acceptTerms, ...address } = input;
    void items;
    void acceptTerms;
    return tx.order.create({
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
        items: {
          create: quote.lines.map(({ selections, ...line }) => ({
            ...line,
            selections: { create: selections },
          })),
        },
        history: { create: { status: 'NEW', note: 'Cash on Delivery order received.' } },
      },
    });
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
    return tx.order.update({
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
  });
}

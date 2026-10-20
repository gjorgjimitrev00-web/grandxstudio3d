import { randomBytes } from 'node:crypto';
import { serializable } from './checkout';
import { hash, HttpError } from './security';
import {
  manualOrderSchema,
  manualSaleDate,
  manualTotals,
  paymentLabels,
} from './manual-order-rules';
import { studioDay } from './time';

export async function createManualOrder(raw: unknown, actorId: string) {
  const input = manualOrderSchema.parse(raw);
  let orderedAt: Date;
  try {
    orderedAt = manualSaleDate(input.date);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  const fingerprint = hash(JSON.stringify(input));
  const idempotencyKey = `manual:${input.idempotencyKey}`;
  return serializable(async (tx) => {
    const actor = await tx.user.findFirst({ where: { id: actorId, role: 'ADMIN' } });
    if (!actor) throw new HttpError(403, 'Administrator access required.');
    const existing = await tx.order.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.enteredById !== actorId || existing.entryFingerprint !== fingerprint)
        throw new HttpError(
          409,
          'This submission was already used for a different order. Open a new order form.',
        );
      return existing;
    }
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((item) => item.productId).filter(Boolean) } },
      include: {
        variants: true,
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      },
    });
    const lines = input.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (item.productId && !product)
        throw new HttpError(400, 'A selected product no longer exists.');
      const variant = product?.variants.find((v) => v.id === item.variantId && v.enabled);
      if (
        product &&
        ((product.variants.length && !variant) || (!product.variants.length && item.variantId))
      )
        throw new HttpError(400, `${product.name}: select an available variant.`);
      if (product?.inventoryMode === 'OUT_OF_STOCK' && input.adjustStock)
        throw new HttpError(
          400,
          `${product.name}: out of stock. For an already-recorded historical stock movement, turn off stock adjustment.`,
        );
      return {
        productId: product?.id ?? null,
        variantId: variant?.id ?? null,
        name: product?.name || item.name,
        sku: variant?.sku || product?.sku || 'CUSTOM',
        variantName: variant?.name || null,
        image: variant?.image || product?.images[0]?.thumbnailUrl || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
        madeToOrder: product?.inventoryMode === 'MADE_TO_ORDER',
        stockDeducted: !!product?.trackInventory && input.adjustStock,
        selections: item.details ? [{ optionName: 'Details', value: item.details }] : [],
      };
    });
    // Guard each decrement in the same serializable transaction. Repeated lines
    // and concurrent online/offline sales cannot reserve the same last unit.
    for (const line of lines) {
      if (!line.stockDeducted) continue;
      const result = line.variantId
        ? await tx.productVariant.updateMany({
            where: { id: line.variantId, enabled: true, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          })
        : await tx.product.updateMany({
            where: { id: line.productId!, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          });
      if (result.count !== 1)
        throw new HttpError(409, `${line.name}: insufficient stock. Review the quantity.`);
    }

    const anonymous = !input.firstName && !input.lastName && !input.email && !input.phone;
    const customerData = {
      firstName: input.firstName || 'Walk-in customer',
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      phone: input.phone,
    };
    let customer = anonymous
      ? await tx.customer.upsert({
          where: { id: 'manual-walk-in-customer' },
          create: { id: 'manual-walk-in-customer', ...customerData },
          update: {},
        })
      : input.email && input.phone
        ? await tx.customer.findFirst({
            where: { email: customerData.email, phone: input.phone, userId: null },
          })
        : null;
    customer ??= await tx.customer.create({ data: customerData });
    const shippingId = input.fulfillment === 'PICKUP' ? 'manual-handover' : 'manual-delivery';
    const shippingName =
      input.fulfillment === 'PICKUP' ? 'In-person handover' : 'Manually arranged delivery';
    // Internal methods stay unavailable to storefront checkout and settings.
    await tx.shippingMethod.upsert({
      where: { id: shippingId },
      create: {
        id: shippingId,
        name: shippingName,
        kind: input.fulfillment === 'PICKUP' ? 'PICKUP' : 'STANDARD',
        enabled: false,
      },
      update: {},
    });
    const year = Number(studioDay().slice(0, 4));
    const sequence = await tx.orderSequence.upsert({
      where: { year },
      create: { year, value: 1 },
      update: { value: { increment: 1 } },
    });
    return tx.order.create({
      data: {
        ...customerData,
        street: input.street,
        city: input.city,
        postalCode: input.postalCode,
        source: 'MANUAL',
        orderedAt,
        enteredById: actorId,
        entryFingerprint: fingerprint,
        idempotencyKey,
        accessTokenHash: hash(randomBytes(32).toString('hex')),
        number: `GX-${year}-${String(sequence.value).padStart(6, '0')}`,
        customerId: customer.id,
        status: input.status,
        paymentMethod: input.paymentMethod,
        deliveredAt: input.status === 'DELIVERED' ? orderedAt : null,
        paidAt: input.paid ? orderedAt : null,
        ...manualTotals(input.items, input.shipping),
        shippingMethodId: shippingId,
        shippingName,
        internalNotes: input.internalNotes,
        items: {
          create: lines.map(({ selections, ...line }) => ({
            ...line,
            selections: { create: selections },
          })),
        },
        history: {
          create: {
            status: input.status,
            note: `Manual order recorded by ${actor.name} (${actor.id}). Sale date: ${input.date}. ${paymentLabels[input.paymentMethod]}; ${input.paid ? 'payment already received' : 'unpaid'}. ${input.adjustStock ? 'Tracked stock adjusted.' : 'Stock not adjusted (historical/manual stock movement).'} No rewards applied.`,
          },
        },
      },
    });
  });
}

import { z } from 'zod';
import { db } from './db';
import { serializable } from './checkout';
import { readJson, requireAdmin, HttpError } from './security';
import { text } from './validation';
import { rewardsSettingsSchema } from './rewards-rules';
import { postPoints, settleOrderRewards, eligibleGift, giftProductInclude } from './rewards';

export async function confirmOrderPayment(id: string, actorId: string) {
  return serializable(async (tx) => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.status !== 'DELIVERED')
      throw new HttpError(400, 'Confirm delivery before recording payment.');
    if (order.paidAt) return order;
    const updated = await tx.order.update({
      where: { id },
      data: {
        paidAt: new Date(),
        history: {
          create: {
            status: order.status,
            note: 'Cash payment confirmed by administrator.',
          },
        },
      },
    });
    return settleOrderRewards(tx, updated, actorId);
  });
}

export const returnSchema = z.object({
  refundedProducts: z.number().int().min(0).max(1000000000),
  giftReturned: z.boolean(),
  reason: text(500),
});
export async function recordOrderReturn(id: string, raw: unknown, actorId: string) {
  const input = returnSchema.parse(raw);
  return serializable(async (tx) => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.status !== 'DELIVERED' || !order.paidAt)
      throw new HttpError(400, 'Returns require a delivered order with confirmed payment.');
    if (
      input.refundedProducts < order.refundedProducts ||
      input.refundedProducts > order.subtotal - order.rewardDiscount ||
      (order.giftReturned && !input.giftReturned) ||
      (input.giftReturned && !order.giftPoints)
    )
      throw new HttpError(
        400,
        'Return totals cannot decrease or exceed the amount paid for products.',
      );
    if (
      input.refundedProducts === order.refundedProducts &&
      input.giftReturned === order.giftReturned
    )
      return order;
    const updated = await tx.order.update({
      where: { id },
      data: {
        refundedProducts: input.refundedProducts,
        giftReturned: input.giftReturned,
        history: {
          create: {
            status: order.status,
            note: `Return recorded: ${input.refundedProducts} MKD total product refund; gift returned: ${input.giftReturned ? 'yes' : 'no'}. ${input.reason}`,
          },
        },
      },
    });
    return settleOrderRewards(tx, updated, actorId);
  });
}

export async function rewardsAdminRequest(request: Request, id?: string, action?: string) {
  const actor = await requireAdmin();
  if (id === 'settings' && request.method === 'PUT') {
    const data = rewardsSettingsSchema.parse(await readJson(request));
    return db.storeSetting.upsert({
      where: { key: 'rewards' },
      create: { key: 'rewards', value: JSON.stringify(data) },
      update: { value: JSON.stringify(data) },
    });
  }
  if (id === 'gifts' && request.method === 'POST') {
    const data = z
      .object({
        productId: text(100),
        points: z.number().int().min(1).max(1000000),
        enabled: z.boolean(),
      })
      .parse(await readJson(request));
    return serializable(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: data.productId },
        include: giftProductInclude,
      });
      if (!product || (data.enabled && !eligibleGift(product)))
        throw new HttpError(
          400,
          'Select an available published product without variants or required options.',
        );
      return tx.rewardGift.upsert({
        where: { productId: data.productId },
        create: data,
        update: data,
      });
    });
  }
  if (id === 'adjust' && request.method === 'POST') {
    const data = z
      .object({
        userId: text(100),
        points: z
          .number()
          .int()
          .min(-1000000)
          .max(1000000)
          .refine((v) => v !== 0),
        reason: text(500),
        idempotencyKey: z.uuid(),
      })
      .parse(await readJson(request));
    await serializable(async (tx) => {
      if (!(await tx.user.findUnique({ where: { id: data.userId } })))
        throw new HttpError(404, 'Account not found.');
      await postPoints(tx, {
        userId: data.userId,
        points: data.points,
        eventKey: `adjust:${data.userId}:${data.idempotencyKey}`,
        kind: 'ADMIN_ADJUSTMENT',
        note: data.reason,
        actorId: actor.id,
      });
    });
    return { ok: true };
  }
  if (id && action === 'payment' && request.method === 'POST')
    return confirmOrderPayment(id, actor.id);
  if (id && action === 'return' && request.method === 'POST')
    return recordOrderReturn(id, await readJson(request), actor.id);
  throw new HttpError(404, 'Rewards endpoint not found.');
}

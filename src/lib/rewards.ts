import { Prisma, type Order } from '@prisma/client';
import { db } from './db';
import { HttpError } from './security';
import { defaultRewardsSettings, rewardsSettingsSchema, refundTargets } from './rewards-rules';

type Tx = Prisma.TransactionClient;
export async function rewardsSettings(tx: Tx = db) {
  const row = await tx.storeSetting.findUnique({ where: { key: 'rewards' } });
  return row ? rewardsSettingsSchema.parse(JSON.parse(row.value)) : defaultRewardsSettings;
}

export const giftProductInclude = {
  images: { orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }], take: 1 },
  variants: { select: { id: true } },
  options: { select: { required: true } },
};
export function eligibleGift(p: {
  published: boolean;
  inventoryMode: string;
  trackInventory: boolean;
  stock: number;
  variants: unknown[];
  options: { required: boolean }[];
}) {
  return (
    p.published &&
    p.inventoryMode !== 'OUT_OF_STOCK' &&
    (!p.trackInventory || p.stock > 0) &&
    p.variants.length === 0 &&
    !p.options.some((o) => o.required)
  );
}
export async function availableGifts(tx: Tx = db) {
  const gifts = await tx.rewardGift.findMany({
    where: { enabled: true },
    include: { product: { include: giftProductInclude } },
    orderBy: [{ points: 'asc' }, { id: 'asc' }],
  });
  return gifts
    .filter((g) => eligibleGift(g.product))
    .map((g) => ({
      id: g.id,
      productId: g.productId,
      name: g.product.name,
      points: g.points,
      image: g.product.images[0]?.thumbnailUrl || null,
      slug: g.product.slug,
    }));
}

// All mutations run inside the same serializable transaction as their order.
// The conditional debit also protects against concurrent checkout requests.
export async function postPoints(
  tx: Tx,
  input: {
    userId: string;
    points: number;
    eventKey: string;
    kind: string;
    note: string;
    orderId?: string;
    actorId?: string;
    allowDebt?: boolean;
  },
) {
  if (!input.points) return;
  if (await tx.rewardsEntry.findUnique({ where: { eventKey: input.eventKey } })) return;
  await tx.rewardsAccount.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId },
    update: {},
  });
  const updated = await tx.rewardsAccount.updateMany({
    where: {
      userId: input.userId,
      ...(input.points < 0 && !input.allowDebt ? { balance: { gte: -input.points } } : {}),
    },
    data: { balance: { increment: input.points } },
  });
  if (updated.count !== 1)
    throw new HttpError(409, 'Your points balance changed. Please review your rewards.');
  await tx.rewardsEntry.create({
    data: {
      accountId: input.userId,
      points: input.points,
      eventKey: input.eventKey,
      kind: input.kind,
      note: input.note,
      orderId: input.orderId,
      actorId: input.actorId,
    },
  });
}

export async function settleOrderRewards(tx: Tx, order: Order, actorId?: string) {
  if (!order.rewardsUserId) return order;
  let earned = 0;
  let restored = 0;
  if (order.status === 'CANCELLED') {
    restored = order.rewardDiscount + order.giftPoints;
  } else if (order.status === 'DELIVERED' && order.paidAt) {
    const targets = refundTargets({
      netProducts: order.subtotal - order.rewardDiscount,
      refundedProducts: order.refundedProducts,
      discountPoints: order.rewardDiscount,
      giftPoints: order.giftPoints,
      giftReturned: order.giftReturned,
      earnEveryMkd: order.earnEveryMkd,
    });
    earned = Math.min(order.pointsEarned, targets.earned);
    restored = targets.restored;
  }
  const change = earned - order.pointsCredited;
  await postPoints(tx, {
    userId: order.rewardsUserId,
    points: change,
    orderId: order.id,
    actorId,
    eventKey: `order:${order.id}:earned:${earned}`,
    kind: change >= 0 ? 'EARNED' : 'RETURN_ADJUSTMENT',
    note: change >= 0 ? `Points earned · ${order.number}` : `Returned products · ${order.number}`,
    // If earned points were already spent, a return creates a debt, not free points.
    allowDebt: true,
  });
  await postPoints(tx, {
    userId: order.rewardsUserId,
    points: restored - order.pointsRestored,
    orderId: order.id,
    actorId,
    eventKey: `order:${order.id}:restored:${restored}`,
    kind: 'RESTORED',
    note: `Points restored · ${order.number}`,
  });
  return tx.order.update({
    where: { id: order.id },
    data: {
      pointsCredited: earned,
      pointsRestored: restored,
    },
  });
}

export async function rewardsSummary(userId: string, page = 1) {
  const [account, pending, history, count] = await Promise.all([
    db.rewardsAccount.findUnique({ where: { userId } }),
    db.order.aggregate({
      where: {
        rewardsUserId: userId,
        status: { not: 'CANCELLED' },
        OR: [{ status: { not: 'DELIVERED' } }, { paidAt: null }],
      },
      _sum: { pointsEarned: true },
    }),
    db.rewardsEntry.findMany({
      where: { accountId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      skip: (page - 1) * 20,
      select: {
        id: true,
        points: true,
        kind: true,
        note: true,
        createdAt: true,
        order: { select: { number: true } },
      },
    }),
    db.rewardsEntry.count({ where: { accountId: userId } }),
  ]);
  return {
    balance: account?.balance || 0,
    pending: pending._sum.pointsEarned || 0,
    history,
    count,
  };
}

import { db } from './db';
import { reportingPeriods } from './time';

export async function paidRevenue(now = new Date()) {
  const { today, month } = reportingPeriods(now);
  const base = { status: 'DELIVERED' as const, paidAt: { not: null, lte: now } };
  const [daily, monthly, all, sources] = await Promise.all([
    db.order.aggregate({
      _sum: { total: true, refundedProducts: true },
      where: { ...base, paidAt: { gte: today, lte: now } },
    }),
    db.order.aggregate({
      _sum: { total: true, refundedProducts: true },
      where: { ...base, paidAt: { gte: month, lte: now } },
    }),
    db.order.aggregate({ _sum: { total: true, refundedProducts: true }, where: base }),
    db.order.groupBy({
      by: ['source'],
      _sum: { total: true, refundedProducts: true },
      where: { ...base, paidAt: { gte: month, lte: now } },
    }),
  ]);
  const net = (row: { _sum: { total: number | null; refundedProducts: number | null } }) =>
    (row._sum.total || 0) - (row._sum.refundedProducts || 0);
  return {
    today: net(daily),
    month: net(monthly),
    total: net(all),
    sources: sources.map((row) => ({ source: row.source, revenue: net(row) })),
  };
}

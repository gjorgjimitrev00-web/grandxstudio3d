import { requireAdminPage } from '@/lib/admin-access';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { AdminHeading, OrdersTable, Pager } from '@/components/admin-shared';
import { rewardsSummary } from '@/lib/rewards';
import { RewardsHistory } from '@/components/rewards-history';
import { PointsAdjustmentForm } from '@/components/rewards-admin-forms';
export default async function Customer({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const page = Math.max(1, Math.min(10000, Math.floor(Number((await searchParams).page) || 1)));
  const c = await db.customer.findUnique({ where: { id } });
  if (!c) notFound();
  const rewards = c.userId ? await rewardsSummary(c.userId, page) : null;
  const [orders, count] = await Promise.all([
    db.order.findMany({
      where: { customerId: id },
      take: 20,
      skip: (page - 1) * 20,
      orderBy: { createdAt: 'desc' },
    }),
    db.order.count({ where: { customerId: id } }),
  ]);
  return (
    <>
      <AdminHeading
        title={`${c.firstName} ${c.lastName}`}
        sub={`${c.email} · ${c.phone} · ${c.userId ? 'Registered customer' : 'Guest customer'}`}
      />
      <OrdersTable orders={orders} />
      <Pager page={page} count={count} path={`/admin/customers/${id}`} />
      {rewards && c.userId && (
        <div className="two-column editor-section">
          <section className="panel">
            <h2>GrandX Rewards</h2>
            <p>
              <b>{rewards.balance}</b> points available · <b>{rewards.pending}</b> pending
            </p>
            <PointsAdjustmentForm userId={c.userId} />
          </section>
          <section className="panel">
            <h2>Points history</h2>
            <RewardsHistory history={rewards.history} />
            <Pager page={page} count={rewards.count} path={`/admin/customers/${id}`} />
          </section>
        </div>
      )}
    </>
  );
}

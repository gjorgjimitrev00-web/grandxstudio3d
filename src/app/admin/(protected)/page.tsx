import { reportingPeriods } from '@/lib/time';
import { requireAdminPage } from '@/lib/admin-access';
import Link from 'next/link';
import { db } from '@/lib/db';
import { money } from '@/lib/utils';
import { AdminHeading, OrdersTable } from '@/components/admin-shared';
export default async function Dashboard() {
  await requireAdminPage();
  const { today, month } = reportingPeriods();
  const [
    ordersToday,
    ordersMonth,
    revenueToday,
    revenueMonth,
    revenue,
    statuses,
    products,
    customers,
    requests,
    recent,
    lowStock,
  ] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: today } } }),
    db.order.count({ where: { createdAt: { gte: month } } }),
    db.order.aggregate({
      _sum: { total: true },
      where: { status: 'DELIVERED', deliveredAt: { gte: today } },
    }),
    db.order.aggregate({
      _sum: { total: true },
      where: { status: 'DELIVERED', deliveredAt: { gte: month } },
    }),
    db.order.aggregate({ _sum: { total: true }, where: { status: 'DELIVERED' } }),
    db.order.groupBy({ by: ['status'], _count: true }),
    db.product.count(),
    db.customer.count(),
    db.customPrintRequest.count({
      where: { status: { in: ['NEW', 'REVIEWING', 'QUOTE_SENT', 'APPROVED', 'PRINTING'] } },
    }),
    db.order.findMany({ take: 8, orderBy: { createdAt: 'desc' } }),
    db.$queryRaw<
      { total: bigint }[]
    >`SELECT COUNT(DISTINCT p.id) total FROM Product p LEFT JOIN ProductVariant v ON v.productId=p.id AND v.enabled=true WHERE p.trackInventory=true AND ((v.id IS NULL AND p.stock<=p.lowStockThreshold) OR v.stock<=p.lowStockThreshold)`,
  ]);
  return (
    <>
      <AdminHeading
        title="Your studio, at a glance."
        sub="Orders, production, and the things that need your attention."
      >
        <Link className="button" href="/admin/products/new">
          Add product +
        </Link>
      </AdminHeading>
      <div className="stats-grid">
        {[
          ['Orders today', String(ordersToday)],
          ['Orders this month', String(ordersMonth)],
          ['Revenue today', money(revenueToday._sum.total || 0)],
          ['Revenue this month', money(revenueMonth._sum.total || 0)],
          ['Total collected revenue', money(revenue._sum.total || 0)],
          ['Products', String(products)],
          ['Low stock products', String(lowStock[0].total)],
          ['Customers', String(customers)],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="form-note">
        Revenue counts delivered Cash on Delivery orders. Dates use Europe/Skopje.
      </p>
      <div className="admin-section">
        <h2>Order pipeline</h2>
        <div className="pipeline">
          {['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(
            (status) => (
              <Link key={status} href={`/admin/orders?status=${status}`}>
                <b>{statuses.find((s) => s.status === status)?._count || 0}</b>
                <span>{status.replaceAll('_', ' ')}</span>
              </Link>
            ),
          )}
        </div>
      </div>
      <div className="admin-section">
        <div className="row between">
          <h2>Recent orders</h2>
          <Link className="text-link" href="/admin/orders">
            All orders ↗
          </Link>
        </div>
        <OrdersTable orders={recent} />
      </div>
      <Link className="custom-request-callout" href="/admin/custom-orders">
        <span>
          <b>{requests} custom print requests</b>
          <p>Review designs, prepare quotes, and manage production.</p>
        </span>
        <span>Open requests ↗</span>
      </Link>
    </>
  );
}

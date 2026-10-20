import { reportingPeriods, studioDay } from '@/lib/time';
import { requireAdminPage } from '@/lib/admin-access';
import Link from 'next/link';
import { db } from '@/lib/db';
import { money } from '@/lib/utils';
import { AdminHeading, OrdersTable } from '@/components/admin-shared';
import { paidRevenue } from '@/lib/revenue';
export default async function Dashboard() {
  await requireAdminPage();
  const { today, month } = reportingPeriods();
  const [
    ordersToday,
    ordersMonth,
    revenue,
    visitors,
    mkVisitors,
    statuses,
    products,
    customers,
    requests,
    recent,
    lowStock,
  ] = await Promise.all([
    db.order.count({ where: { orderedAt: { gte: today } } }),
    db.order.count({ where: { orderedAt: { gte: month } } }),
    paidRevenue(),
    db.visitorDay.count({ where: { day: studioDay() } }),
    db.visitorDay.count({ where: { day: studioDay(), country: 'MK' } }),
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
        <div className="row">
          <Link className="button outline" href="/admin/products/new">
            Add product +
          </Link>
          <Link className="button" href="/admin/orders/new">
            Add order +
          </Link>
        </div>
      </AdminHeading>
      <div className="stats-grid">
        {[
          ['Orders today', String(ordersToday)],
          ['Orders this month', String(ordersMonth)],
          ['Paid revenue today', money(revenue.today)],
          ['Paid revenue this month', money(revenue.month)],
          ['Total paid revenue', money(revenue.total)],
          ['Visitors today · estimated', String(visitors)],
          ['Visitors from North Macedonia', String(mkVisitors)],
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
        Paid revenue includes completed orders with confirmed payment, after discounts and recorded
        product refunds, including delivery. Dates use Europe/Skopje and the recorded payment date.
        Backdated paid manual sales use the selected sale date; later refunds reduce that original
        period. Unconfirmed payments are excluded.
      </p>
      <div className="row between admin-section">
        <p>
          Paid this month: website{' '}
          <b>{money(revenue.sources.find((row) => row.source === 'ONLINE')?.revenue || 0)}</b>
          {' · '}manual / in person{' '}
          <b>{money(revenue.sources.find((row) => row.source === 'MANUAL')?.revenue || 0)}</b>
        </p>
        <Link className="text-link" href="/admin/analytics">
          Visitors by city ↗
        </Link>
      </div>
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

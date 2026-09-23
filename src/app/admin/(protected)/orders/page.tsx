import { requireAdminPage } from '@/lib/admin-access';
import { OrderStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AdminHeading, OrdersTable, Pager } from '@/components/admin-shared';
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const status = Object.values(OrderStatus).includes(p.status as OrderStatus)
    ? (p.status as OrderStatus)
    : undefined;
  const where: Prisma.OrderWhereInput = {
    status,
    ...(p.q
      ? {
          OR: [
            { number: { contains: p.q.slice(0, 100) } },
            { firstName: { contains: p.q.slice(0, 100) } },
            { phone: { contains: p.q.slice(0, 100) } },
          ],
        }
      : {}),
  };
  const [orders, count] = await Promise.all([
    db.order.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: { createdAt: 'desc' } }),
    db.order.count({ where }),
  ]);
  return (
    <>
      <AdminHeading title="Orders" sub="From the first idea to the customer’s door." />
      <form className="admin-search">
        <input
          name="q"
          placeholder="Order number, customer, or phone"
          defaultValue={p.q}
          aria-label="Search orders"
        />
        <select name="status" defaultValue={p.status || ''} aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.values(OrderStatus).map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <button className="button outline">Filter</button>
      </form>
      <OrdersTable orders={orders} />
      <Pager
        page={page}
        count={count}
        path="/admin/orders"
        query={`&status=${status || ''}&q=${encodeURIComponent(p.q || '')}`}
      />
    </>
  );
}

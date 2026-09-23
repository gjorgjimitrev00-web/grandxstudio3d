import { requireAdminPage } from '@/lib/admin-access';
import Link from 'next/link';
import { db } from '@/lib/db';
import { money } from '@/lib/utils';
import { AdminHeading, Pager } from '@/components/admin-shared';
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const where = p.q
    ? {
        OR: [
          { email: { contains: p.q.slice(0, 100) } },
          { firstName: { contains: p.q.slice(0, 100) } },
          { phone: { contains: p.q.slice(0, 100) } },
        ],
      }
    : {};
  const [customers, count] = await Promise.all([
    db.customer.findMany({
      where,
      take: 20,
      skip: (page - 1) * 20,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { orders: true } },
        orders: { take: 1, orderBy: { createdAt: 'desc' }, select: { createdAt: true } },
      },
    }),
    db.customer.count({ where }),
  ]);
  const totals = await db.order.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customers.map((c) => c.id) }, status: 'DELIVERED' },
    _sum: { total: true },
  });
  return (
    <>
      <AdminHeading
        title="Customers"
        sub="Guest customers and registered members, with their order histories."
      />
      <form className="admin-search">
        <input
          name="q"
          defaultValue={p.q}
          placeholder="Name, email, phone"
          aria-label="Search customers"
        />
        <button className="button outline">Search</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Orders</th>
              <th>Collected total</th>
              <th>Last order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="table-link" href={`/admin/customers/${c.id}`}>
                    {c.firstName} {c.lastName}
                  </Link>
                </td>
                <td>{c.phone}</td>
                <td>{c.email}</td>
                <td>{c._count.orders}</td>
                <td>{money(totals.find((t) => t.customerId === c.id)?._sum.total || 0)}</td>
                <td>{c.orders[0]?.createdAt.toLocaleDateString('mk-MK') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!customers.length && <div className="empty">No customers yet.</div>}
      </div>
      <Pager
        page={page}
        count={count}
        path="/admin/customers"
        query={`&q=${encodeURIComponent(p.q || '')}`}
      />
    </>
  );
}

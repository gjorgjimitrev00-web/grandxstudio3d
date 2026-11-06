import Link from 'next/link';
import { RequestStatus } from '@prisma/client';
import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { money } from '@/lib/utils';
import { AdminHeading, Pager } from '@/components/admin-shared';

export default async function FrameOrders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const page = Math.min(10000, Math.max(1, parseInt(query.page || '', 10) || 1));
  const status = Object.values(RequestStatus).find((value) => value === query.status);
  const where = { status };
  const [orders, count] = await Promise.all([
    db.frameOrder.findMany({
      where,
      take: 20,
      skip: (page - 1) * 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        reference: true,
        name: true,
        quantity: true,
        unitPrice: true,
        paper: true,
        status: true,
        createdAt: true,
      },
    }),
    db.frameOrder.count({ where }),
  ]);
  return (
    <>
      <AdminHeading title="Frame orders">
        <Link href="/admin/frame-orders/prices" className="button outline">
          Set frame prices
        </Link>
      </AdminHeading>
      <form className="admin-search">
        <select
          name="status"
          defaultValue={status ?? ''}
          aria-label="Filter frame orders by status"
        >
          <option value="">All statuses</option>
          {Object.values(RequestStatus).map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <button className="button outline">Filter</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Reference', 'Customer', 'Paper', 'Copies', 'Subtotal', 'Status', 'Received'].map(
                (label) => (
                  <th key={label}>{label}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link className="table-link" href={`/admin/frame-orders/${o.id}`}>
                    {o.reference}
                  </Link>
                </td>
                <td>{o.name}</td>
                <td>{o.paper}</td>
                <td>{o.quantity}</td>
                <td>
                  {o.unitPrice === null ? 'Quote requested' : money(o.unitPrice * o.quantity)}
                </td>
                <td>
                  <span className="status-pill">{o.status.replaceAll('_', ' ')}</span>
                </td>
                <td>{o.createdAt.toLocaleDateString('mk-MK', { timeZone: 'Europe/Skopje' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!count && (
          <div className="empty">
            {status
              ? 'No frame orders with this status.'
              : 'Frame orders from the storefront will appear here.'}
          </div>
        )}
      </div>
      <Pager
        page={page}
        count={count}
        path="/admin/frame-orders"
        query={status ? `&status=${status}` : ''}
      />
    </>
  );
}

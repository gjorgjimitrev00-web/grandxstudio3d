import Link from 'next/link';
import { AdminHeading, Pager } from '@/components/admin-shared';
import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';

export default async function EventOrders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const page = Math.max(1, Math.min(100000, parseInt((await searchParams).page || '1', 10) || 1));
  const [rows, count] = await Promise.all([
    db.eventOrderRequest.findMany({
      orderBy: { createdAt: 'desc' },
      skip: 20 * (page - 1),
      take: 20,
      select: {
        id: true,
        name: true,
        company: true,
        productName: true,
        quantity: true,
        eventDate: true,
        status: true,
      },
    }),
    db.eventOrderRequest.count(),
  ]);
  return (
    <>
      <AdminHeading title="Events & business orders" />
      <div className="panel table-wrap">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Event</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={'/admin/event-orders/' + r.id}>
                      {r.name}
                      {r.company ? ' · ' + r.company : ''}
                    </Link>
                  </td>
                  <td>{r.productName}</td>
                  <td>{r.quantity}</td>
                  <td>{r.eventDate}</td>
                  <td>{r.status.replaceAll('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No event requests yet.</p>
        )}
      </div>
      <Pager page={page} count={count} path="/admin/event-orders" />
    </>
  );
}

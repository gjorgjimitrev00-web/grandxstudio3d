import { requireAdminPage } from '@/lib/admin-access';
import Link from 'next/link';
import { RequestStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { AdminHeading, Pager } from '@/components/admin-shared';
export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const where = {
    status: Object.values(RequestStatus).includes(p.status as RequestStatus)
      ? (p.status as RequestStatus)
      : undefined,
  };
  const [requests, count] = await Promise.all([
    db.customPrintRequest.findMany({
      where,
      take: 20,
      skip: (page - 1) * 20,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { files: true } } },
    }),
    db.customPrintRequest.count({ where }),
  ]);
  return (
    <>
      <AdminHeading
        title="Custom print requests"
        sub="Turn your customers’ designs into something tangible."
      />
      <form className="admin-search">
        <select name="status" defaultValue={p.status || ''} aria-label="Status">
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
              <th>Customer</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Files</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link className="table-link" href={`/admin/custom-orders/${r.id}`}>
                    {r.name}
                  </Link>
                  <p className="small muted">{r.phone}</p>
                </td>
                <td>{r.description.slice(0, 90)}</td>
                <td>{r.quantity}</td>
                <td>{r._count.files}</td>
                <td>
                  <span className="status-pill">{r.status.replaceAll('_', ' ')}</span>
                </td>
                <td>{r.createdAt.toLocaleDateString('mk-MK')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!requests.length && <div className="empty">No requests yet.</div>}
      </div>
      <Pager
        page={page}
        count={count}
        path="/admin/custom-orders"
        query={`&status=${p.status || ''}`}
      />
    </>
  );
}

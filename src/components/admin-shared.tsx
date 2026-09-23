import Link from 'next/link';
import { money } from '@/lib/utils';
export function AdminHeading({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-heading">
      <div>
        <p className="eyebrow orange">GRANDXSTUDIO / ADMIN</p>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
export function Pager({
  page,
  count,
  path,
  query = '',
}: {
  page: number;
  count: number;
  path: string;
  query?: string;
}) {
  return (
    <div className="pagination">
      {page > 1 && (
        <Link className="button outline" href={`${path}?page=${page - 1}${query}`}>
          Previous
        </Link>
      )}
      <span>
        {page} / {Math.max(1, Math.ceil(count / 20))}
      </span>
      {page * 20 < count && (
        <Link className="button outline" href={`${path}?page=${page + 1}${query}`}>
          Next
        </Link>
      )}
    </div>
  );
}
export function OrdersTable({
  orders,
}: {
  orders: {
    id: string;
    number: string;
    firstName: string;
    lastName: string;
    phone: string;
    createdAt: Date;
    total: number;
    status: string;
  }[];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Phone</th>
            <th>Date</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link className="table-link" href={`/admin/orders/${o.id}`}>
                  {o.number}
                </Link>
              </td>
              <td>
                {o.firstName} {o.lastName}
              </td>
              <td>{o.phone}</td>
              <td>{o.createdAt.toLocaleDateString('mk-MK', { timeZone: 'Europe/Skopje' })}</td>
              <td>{money(o.total)}</td>
              <td>
                <span className={`status-pill status-${o.status.toLowerCase()}`}>
                  {o.status.replaceAll('_', ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <div className="empty">No orders yet.</div>}
    </div>
  );
}

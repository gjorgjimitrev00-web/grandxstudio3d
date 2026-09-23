import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { db } from '@/lib/db';
import { currentUser, hash, secureEqual } from '@/lib/security';
import { getCopy } from '@/lib/i18n';
import { money } from '@/lib/utils';
export const metadata = { title: 'Order confirmation', robots: { index: false, follow: false } };
export default async function Confirmation({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!/^GX-\d{4}-\d{6,}$/.test(orderNumber)) notFound();
  const order = await db.order.findUnique({
    where: { number: orderNumber },
    include: {
      items: { include: { selections: true } },
      customer: { select: { userId: true } },
      history: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) notFound();
  const token = (await cookies()).get(`gx-order-${order.number}`)?.value;
  const user = await currentUser();
  if (
    !(token && secureEqual(hash(token), order.accessTokenHash)) &&
    !(user && (user.role === 'ADMIN' || order.customer.userId === user.id))
  )
    notFound();
  const copy = await getCopy();
  return (
    <div className="page confirmation">
      <div className="confirmation-head">
        <span className="confirmation-icon">
          <Check />
        </span>
        <p className="eyebrow orange">{order.number}</p>
        <h1 className="page-title">{copy.thanks}</h1>
        <p className="muted">{copy.cod} — Плаќате кога ќе пристигне пратката.</p>
      </div>
      <div className="two-column">
        <div className="panel">
          <h2>{copy.cart}</h2>
          {order.items.map((i) => (
            <div className="checkout-item" key={i.id}>
              <div>
                <b>{i.name}</b>
                <p className="small muted">
                  {i.variantName} × {i.quantity}
                </p>
                {i.selections.map((s) => (
                  <p key={s.id} className="small">
                    {s.optionName}: {s.value}
                  </p>
                ))}
                {i.madeToOrder && <span className="status-pill">{copy.madeToOrder}</span>}
              </div>
              <b>{money(i.subtotal)}</b>
            </div>
          ))}
          <div className="row between">
            <span>{copy.subtotal}</span>
            <b>{money(order.subtotal)}</b>
          </div>
          <div className="row between">
            <span>{copy.shipping}</span>
            <b>{money(order.shipping)}</b>
          </div>
          <div className="row between">
            <h3>{copy.total}</h3>
            <h3>{money(order.total)}</h3>
          </div>
        </div>
        <div className="stack">
          <div className="panel">
            <h2>{copy.shipping}</h2>
            <p>
              {order.firstName} {order.lastName}
              <br />
              {order.phone}
              <br />
              {order.email}
              <br />
              {order.street}
              <br />
              {order.postalCode} {order.city}
              <br />
              {copy.country}
            </p>
            <p className="muted">{order.shippingName}</p>
          </div>
          <div className="panel">
            <h2>Status</h2>
            <ol className="timeline">
              {order.history.map((h) => (
                <li key={h.id}>
                  <b>{h.status.replaceAll('_', ' ')}</b>
                  <span>{h.createdAt.toLocaleString('mk-MK', { timeZone: 'Europe/Skopje' })}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <Link href="/shop" className="text-link centered">
        {copy.continue} ↗
      </Link>
    </div>
  );
}

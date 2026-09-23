import { requireAdminPage } from '@/lib/admin-access';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { money } from '@/lib/utils';
import { AdminHeading } from '@/components/admin-shared';
import { StatusForm } from '@/components/admin-forms';
import { statusTransitions } from '@/lib/checkout';
export default async function OrderDetails({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const o = await db.order.findUnique({
    where: { id: (await params).id },
    include: {
      items: { include: { selections: true } },
      history: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!o) notFound();
  return (
    <>
      <AdminHeading
        title={o.number}
        sub={`${o.createdAt.toLocaleString('mk-MK', { timeZone: 'Europe/Skopje' })} · Cash on Delivery`}
      />
      <div className="two-column">
        <div className="stack">
          <section className="panel">
            <h2>Order items</h2>
            {o.items.map((i) => (
              <div className="checkout-item" key={i.id}>
                <div>
                  <b>{i.name}</b>
                  <p>
                    {i.variantName} · {i.sku}
                  </p>
                  <p className="small muted">
                    {i.quantity} × {money(i.unitPrice)}
                  </p>
                  {i.selections.map((s) => (
                    <p className="small" key={s.id}>
                      {s.optionName}: {s.value}
                    </p>
                  ))}
                  {i.madeToOrder && (
                    <span className="status-pill production-pill">
                      MADE TO ORDER — PRODUCTION REQUIRED
                    </span>
                  )}
                </div>
                <b>{money(i.subtotal)}</b>
              </div>
            ))}
            <div className="totals">
              <div>
                <span>Subtotal</span>
                <b>{money(o.subtotal)}</b>
              </div>
              <div>
                <span>{o.shippingName}</span>
                <b>{money(o.shipping)}</b>
              </div>
              <div>
                <h3>Total</h3>
                <h3>{money(o.total)}</h3>
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Customer</h2>
            <p>
              <b>
                {o.firstName} {o.lastName}
              </b>
              <br />
              <a href={`tel:${o.phone}`}>{o.phone}</a>
              <br />
              {o.email}
              <br />
              {o.street}
              <br />
              {o.postalCode} {o.city}
              <br />
              {o.country}
            </p>
            {o.notes && (
              <div className="notice editor-section">
                <b>Customer notes</b>
                <p className="pre-line">{o.notes}</p>
              </div>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h2>Manage order</h2>
            <StatusForm
              endpoint={`/api/admin/orders/${o.id}`}
              status={o.status}
              allowed={statusTransitions[o.status]}
              notes={o.internalNotes}
            />
            <p className="form-note">
              Cancellation restores tracked stock once. Delivered and cancelled orders are final.
            </p>
          </section>
          <section className="panel">
            <h2>Timeline</h2>
            <ol className="timeline">
              {o.history.map((h) => (
                <li key={h.id}>
                  <b>{h.status.replaceAll('_', ' ')}</b>
                  <span>{h.createdAt.toLocaleString('mk-MK', { timeZone: 'Europe/Skopje' })}</span>
                  {h.note && <p className="small">{h.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

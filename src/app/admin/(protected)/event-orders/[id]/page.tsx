import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin-access';
import { AdminHeading } from '@/components/admin-shared';
import { AdminQuoteForm, PrivateQuoteLink } from '@/components/event-order-forms';
import { eventReviewPath } from '@/lib/event-orders';
import { money, siteUrl } from '@/lib/utils';
import { studioDay } from '@/lib/time';
import '@/app/(store)/event-orders/events.css';

export default async function EventAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const r = await db.eventOrderRequest.findUnique({
    where: { id: (await params).id },
    include: { assets: { select: { kind: true } }, order: { select: { id: true, number: true } } },
  });
  if (!r) notFound();
  return (
    <>
      <Link href="/admin/event-orders" className="text-link">
        ← Event requests
      </Link>
      <AdminHeading
        title={r.name}
        sub={[r.company, r.status.replaceAll('_', ' ')].filter(Boolean).join(' · ')}
      />
      <div className="two-column">
        <div className="stack">
          <section className="panel">
            <h2>{r.productName}</h2>
            <dl className="detail-list">
              <div>
                <dt>Pieces</dt>
                <dd>{r.quantity}</dd>
              </div>
              <div>
                <dt>Event</dt>
                <dd>{r.eventDate}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  {r.phone}
                  <br />
                  {r.email}
                </dd>
              </div>
            </dl>
            <p className="pre-line">{r.notes}</p>
            {r.assets.some((a) => a.kind === 'logo') && (
              <p>
                <a href={'/api/admin/event-orders/' + r.id + '/logo'} className="text-link">
                  View logo
                </a>
                {' · '}
                <a
                  href={'/api/admin/event-orders/' + r.id + '/original-logo'}
                  download
                  className="text-link"
                >
                  Download original logo
                </a>
              </p>
            )}
            {r.names && (
              <details>
                <summary>Private names for printing</summary>
                <p className="pre-line">{r.names}</p>
              </details>
            )}
          </section>
          {r.unitPrice !== null && (
            <section className="panel">
              <h2>Current quote</h2>
              <img
                className="event-sample"
                src={'/api/admin/event-orders/' + r.id + '/sample?v=' + r.revision}
                alt="Latest quoted sample"
              />
              <p>
                {r.quantity} × {money(r.unitPrice)} · Delivery {money(r.shipping || 0)} · Total{' '}
                {money(r.quantity * r.unitPrice + (r.shipping || 0))}
              </p>
              <p>Ready by {r.readyBy}</p>
              <p className="pre-line">{r.quoteNotes}</p>
            </section>
          )}
        </div>
        <div className="stack">
          <section className="panel">
            <h2>Share the private quote</h2>
            <p className="form-note">
              Copy the link to send to the customer. The same link shows the latest quote.
            </p>
            <PrivateQuoteLink url={siteUrl() + eventReviewPath(r.id)} locale="en" />
          </section>
          {r.order ? (
            <section className="panel">
              <h2>Approved order</h2>
              <Link href={'/admin/orders/' + r.order.id} className="button">
                Open {r.order.number}
              </Link>
            </section>
          ) : (
            <AdminQuoteForm
              id={r.id}
              revision={r.revision}
              readyBy={r.readyBy}
              eventDate={r.eventDate}
              unitPrice={r.unitPrice}
              notes={r.quoteNotes}
              today={studioDay()}
            />
          )}
        </div>
      </div>
    </>
  );
}

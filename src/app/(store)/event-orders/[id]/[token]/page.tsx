import { notFound } from 'next/navigation';
import { eventLinkMatches, eventReviewPath } from '@/lib/event-orders';
import { db } from '@/lib/db';
import { getLocale } from '@/lib/i18n';
import { money, siteUrl } from '@/lib/utils';
import { studioDay } from '@/lib/time';
import { PrivateQuoteLink, QuoteApproval } from '@/components/event-order-forms';
import '../../events.css';

export const metadata = {
  title: 'GrandXStudio · Private quote',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default async function EventReview({
  params,
}: {
  params: Promise<{ id: string; token: string }>;
}) {
  const { id, token } = await params;
  if (!eventLinkMatches(id, token)) notFound();
  const [r, locale] = await Promise.all([
    db.eventOrderRequest.findUnique({
      where: { id },
      select: {
        productName: true,
        quantity: true,
        eventDate: true,
        status: true,
        revision: true,
        unitPrice: true,
        shipping: true,
        readyBy: true,
        quoteNotes: true,
        order: { select: { number: true } },
      },
    }),
    getLocale(),
  ]);
  if (!r) notFound();
  const en = locale === 'en';
  const hasQuote = r.unitPrice !== null && r.shipping !== null && r.readyBy !== null;
  return (
    <div className="page event-page event-private">
      <h1 className="page-title">
        {r.order
          ? en
            ? 'Order confirmed'
            : 'Нарачката е потврдена'
          : hasQuote
            ? en
              ? 'Your sample and quote'
              : 'Твојот примерок и понуда'
            : en
              ? 'Request received'
              : 'Барањето е примено'}
      </h1>
      {r.order && (
        <p className="page-intro">
          {en ? 'Order number' : 'Број на нарачка'} <strong>{r.order.number}</strong>
        </p>
      )}
      {!hasQuote && (
        <p className="page-intro">
          {en
            ? 'The studio will review your request. Save this private link and return here for your sample, price and production date.'
            : 'Студиото ќе го разгледа барањето. Зачувај го приватниот линк и отвори го повторно за примерокот, цената и рокот за изработка.'}
        </p>
      )}
      <div className="stack">
        <section className="panel">
          <h2>{en ? 'Private quote link' : 'Приватен линк за понудата'}</h2>
          <p className="form-note">
            {en
              ? 'Anyone with this link can view and approve the quote. Keep it private.'
              : 'Секој со овој линк може да ја види и одобри понудата. Чувај го приватно.'}
          </p>
          <PrivateQuoteLink locale={locale} url={siteUrl() + eventReviewPath(id)} />
        </section>
        <section className="panel">
          <h2>{r.productName === 'Custom event design' && !en ? 'Своја идеја' : r.productName}</h2>
          {hasQuote && (
            <img
              className="event-sample"
              src={'/api/event-orders/' + id + '/' + token + '/sample?v=' + r.revision}
              alt={en ? 'Studio sample for your order' : 'Примерок од студиото за твојата нарачка'}
            />
          )}
          <dl className="detail-list">
            <div>
              <dt>{en ? 'Pieces' : 'Парчиња'}</dt>
              <dd>{r.quantity}</dd>
            </div>
            <div>
              <dt>{en ? 'Event date' : 'Датум на настанот'}</dt>
              <dd>{r.eventDate}</dd>
            </div>
            {hasQuote && (
              <>
                <div>
                  <dt>{en ? 'Ready by' : 'Изработка до'}</dt>
                  <dd>{r.readyBy}</dd>
                </div>
                <div>
                  <dt>{en ? 'Price per piece' : 'Цена по парче'}</dt>
                  <dd>{money(r.unitPrice!)}</dd>
                </div>
                <div>
                  <dt>{en ? 'Delivery' : 'Достава'}</dt>
                  <dd>{money(r.shipping!)}</dd>
                </div>
                <div>
                  <dt>{en ? 'Total payable on delivery' : 'Вкупно за плаќање при достава'}</dt>
                  <dd>
                    <strong>{money(r.unitPrice! * r.quantity + r.shipping!)}</strong>
                  </dd>
                </div>
              </>
            )}
          </dl>
          {r.quoteNotes && <p className="pre-line">{r.quoteNotes}</p>}
        </section>
        {r.status === 'QUOTE_SENT' &&
          (r.readyBy! >= studioDay() ? (
            <QuoteApproval id={id} token={token} revision={r.revision} locale={locale} />
          ) : (
            <p className="notice">
              {en
                ? 'This production date has passed. Contact the studio for a revised quote.'
                : 'Рокот за изработка помина. Побарај нова понуда од студиото.'}
            </p>
          ))}
      </div>
    </div>
  );
}

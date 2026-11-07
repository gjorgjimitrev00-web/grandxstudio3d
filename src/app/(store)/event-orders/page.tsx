import { db } from '@/lib/db';
import { getLocale } from '@/lib/i18n';
import { storefrontProductWhere } from '@/lib/catalog-visibility';
import { studioDay } from '@/lib/time';
import { EventRequestForm } from '@/components/event-order-forms';
import './events.css';

export async function generateMetadata() {
  const en = (await getLocale()) === 'en';
  return {
    title: en ? 'Events & business orders' : 'За настани и компании',
    alternates: { canonical: '/event-orders' },
  };
}
export default async function EventsPage() {
  const [locale, products] = await Promise.all([
    getLocale(),
    db.product.findMany({
      where: { ...storefrontProductWhere, inventoryMode: { not: 'OUT_OF_STOCK' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  const en = locale === 'en';
  return (
    <div className="page event-page">
      <h1 className="page-title">{en ? 'Events & business orders' : 'За настани и компании'}</h1>
      <p className="page-intro">
        {en
          ? 'Order personalised gifts for your guests, team or clients. Tell us the quantity and date. We’ll prepare a sample and a price for you to approve before we start printing.'
          : 'Нарачај персонализирани подароци за гостите, тимот или клиентите. Кажи ни ја количината и датумот. Пред изработка ќе добиеш примерок и понуда за одобрување.'}
      </p>
      <EventRequestForm locale={locale} products={products} today={studioDay()} />
    </div>
  );
}

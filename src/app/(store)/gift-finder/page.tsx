import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getLocale } from '@/lib/i18n';
import { db } from '@/lib/db';
import { storefrontProductWhere } from '@/lib/catalog-visibility';
import { getBlackFriday } from '@/lib/campaigns';
import { withCampaign } from '@/lib/campaign-rules';
import {
  giftTags,
  giftPricing,
  occasions,
  recipients,
  type Occasion,
  type Recipient,
} from '@/lib/gift-finder';
import { money } from '@/lib/utils';
import './finder.css';

export async function generateMetadata() {
  return {
    title: (await getLocale()) === 'en' ? 'Gift finder' : 'Најди подарок',
    alternates: { canonical: '/gift-finder' },
  };
}

export default async function GiftFinder({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [locale, query, campaign, products] = await Promise.all([
    getLocale(),
    searchParams,
    getBlackFriday(),
    db.product.findMany({
      where: { ...storefrontProductWhere, inventoryMode: { not: 'OUT_OF_STOCK' } },
      select: {
        id: true,
        slug: true,
        name: true,
        price: true,
        salePrice: true,
        trackInventory: true,
        stock: true,
        inventoryMode: true,
        bestseller: true,
        featured: true,
        giftProfile: { select: { occasions: true, recipients: true } },
        categories: {
          select: { categoryId: true, category: { select: { name: true, slug: true } } },
        },
        variants: { select: { price: true, priceAdjustment: true, enabled: true, stock: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { listingUrl: true, url: true, altText: true },
        },
      },
      orderBy: [{ bestseller: 'desc' }, { featured: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    }),
  ]);
  const en = locale === 'en',
    index = en ? 1 : 0;
  const occasion =
    typeof query.occasion === 'string' && Object.hasOwn(occasions, query.occasion)
      ? (query.occasion as Occasion)
      : '';
  const recipient =
    typeof query.recipient === 'string' && Object.hasOwn(recipients, query.recipient)
      ? (query.recipient as Recipient)
      : '';
  const budget =
    typeof query.budget === 'string' && ['500', '1000', '2000', '3000'].includes(query.budget)
      ? Number(query.budget)
      : 0;
  const now = new Date();
  const picks = products.flatMap((product) => {
    const tag = giftTags(product);
    if (product.giftProfile && !tag.occasions.length && !tag.recipients.length) return [];
    if (
      (occasion && !tag.occasions.includes(occasion)) ||
      (recipient && !tag.recipients.includes(recipient))
    )
      return [];
    const price = giftPricing(withCampaign(product, campaign, now));
    return price && (!budget || price.price <= budget) ? [{ product, ...price }] : [];
  });
  const pages = Math.max(1, Math.ceil(picks.length / 12));
  const page = Math.max(1, Math.min(pages, Number.parseInt(String(query.page), 10) || 1));
  function pageLink(n: number) {
    const p = new URLSearchParams();
    if (occasion) p.set('occasion', occasion);
    if (recipient) p.set('recipient', recipient);
    if (budget) p.set('budget', String(budget));
    p.set('page', String(n));
    return '/gift-finder?' + p;
  }
  return (
    <div className="page gift-page">
      <header className="gift-heading">
        <div>
          <Link href="/shop" className="text-link">
            {en ? 'Shop' : 'Продавница'}
          </Link>
          <h1 className="page-title">{en ? 'Find a gift' : 'Најди подарок'}</h1>
          <p>
            {en
              ? 'Choose who it’s for, the occasion, and how much you’d like to spend.'
              : 'Избери за кого е подарокот, повод и буџет.'}
          </p>
        </div>
        <img
          src="/images/about-studio-2026.webp"
          alt={
            en
              ? 'Vase, phone stand and candle holder from our studio'
              : 'Вазна, држач за телефон и држач за свеќа од студиото'
          }
        />
      </header>
      <form className="gift-filters" action="/gift-finder#gift-results">
        <label>
          {en ? 'Occasion' : 'Повод'}
          <select name="occasion" defaultValue={occasion}>
            <option value="">{en ? 'Any occasion' : 'Секој повод'}</option>
            {Object.entries(occasions).map(([k, v]) => (
              <option key={k} value={k}>
                {v[index]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en ? 'Recipient' : 'За кого'}
          <select name="recipient" defaultValue={recipient}>
            <option value="">{en ? 'Anyone' : 'За секого'}</option>
            {Object.entries(recipients).map(([k, v]) => (
              <option key={k} value={k}>
                {v[index]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en ? 'Budget' : 'Буџет'}
          <select name="budget" defaultValue={budget || ''}>
            <option value="">{en ? 'Any budget' : 'Секој буџет'}</option>
            {[500, 1000, 2000, 3000].map((v) => (
              <option key={v} value={v}>
                {en ? 'Up to' : 'До'} {money(v)}
              </option>
            ))}
          </select>
        </label>
        <button className="button">
          {en ? 'Find gifts' : 'Најди подароци'} <ArrowRight size={16} />
        </button>
      </form>
      <div className="row between gift-results" id="gift-results">
        <h2>
          {en ? 'Gift ideas' : 'Предлози за подарок'} <small>({picks.length})</small>
        </h2>
        {(budget > 0 || occasion || recipient) && (
          <Link className="text-link" href="/gift-finder">
            {en ? 'Clear filters' : 'Исчисти ги филтрите'}
          </Link>
        )}
      </div>
      {picks.length ? (
        <div className="gift-grid">
          {picks.slice((page - 1) * 12, page * 12).map(({ product: p, price, varies }) => (
            <Link key={p.id} className="gift-card" href={'/product/' + p.slug}>
              <img
                loading="lazy"
                src={p.images[0]?.listingUrl || p.images[0]?.url || '/favicon.svg'}
                alt={p.images[0]?.altText || p.name}
              />
              <h3>{p.name}</h3>
              <span>
                {varies ? (en ? 'From ' : 'Од ') : ''}
                {money(price)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <p>
            {en
              ? 'No available products match all three choices. Try another budget or occasion.'
              : 'Нема достапни производи со овој избор. Обиди се со друг буџет или повод.'}
          </p>
        </div>
      )}
      {pages > 1 && (
        <nav className="pagination">
          {page > 1 && <Link href={pageLink(page - 1)}>{en ? 'Previous' : 'Назад'}</Link>}
          <span>
            {page} / {pages}
          </span>
          {page < pages && <Link href={pageLink(page + 1)}>{en ? 'Next' : 'Следно'}</Link>}
        </nav>
      )}
    </div>
  );
}

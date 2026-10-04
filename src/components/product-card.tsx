import Link from 'next/link';
import { QuickAdd } from './quick-add';
import { money } from '@/lib/utils';
import type { Copy } from '@/lib/i18n';
export type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  salePrice: number | null;
  isNew: boolean;
  bestseller: boolean;
  inventoryMode: string;
  images: { url: string; listingUrl: string; altText: string }[];
  categories?: { category: { name: string } }[];
};
export function ProductCard({ product: p, copy }: { product: CardProduct; copy: Copy }) {
  return (
    <article className="product-card">
      <Link className="product-photo" href={`/product/${p.slug}`}>
        <img
          loading="lazy"
          src={p.images[0]?.listingUrl || p.images[0]?.url || '/favicon.svg'}
          alt={p.images[0]?.altText || p.name}
        />
        {(p.salePrice !== null || p.bestseller || p.isNew) && (
          <span className={`badge ${p.salePrice !== null ? 'sale' : ''}`}>
            {p.salePrice !== null ? copy.sale : p.bestseller ? copy.bestsellerLabel : copy.newLabel}
          </span>
        )}
      </Link>
      <div className="product-caption">
        <span className="eyebrow muted">{p.categories?.[0]?.category.name || 'GRANDXSTUDIO'}</span>
        <Link href={`/product/${p.slug}`}>
          <h3>{p.name}</h3>
        </Link>
        <div className="row between">
          <p>
            <b>{money(p.salePrice ?? p.price)}</b>{' '}
            {p.salePrice !== null && <del>{money(p.price)}</del>}
          </p>
          <QuickAdd id={p.id} name={p.name} copy={copy} />
        </div>
      </div>
    </article>
  );
}

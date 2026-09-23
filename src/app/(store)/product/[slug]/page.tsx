import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { db } from '@/lib/db';
import { getCopy } from '@/lib/i18n';
import { ProductDetail } from '@/components/product-detail';
import { ProductCard } from '@/components/product-card';
import { safeJsonLd, siteUrl, serialize } from '@/lib/utils';
const getProduct = cache((slug: string) =>
  db.product.findFirst({
    where: { slug, published: true },
    include: {
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
      options: { orderBy: { sortOrder: 'asc' }, include: { values: true } },
      variants: { include: { values: { include: { value: true } } } },
      specifications: { orderBy: { sortOrder: 'asc' } },
      categories: { include: { category: true } },
    },
  }),
);
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProduct((await params).slug);
  if (!p) return { title: 'Not found' };
  const image = p.images[0]?.url;
  return {
    title: p.seoTitle || p.name,
    description: p.seoDescription || p.shortDescription,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: {
      title: p.name,
      description: p.shortDescription,
      images: image ? [new URL(image, siteUrl()).href] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: p.name,
      images: image ? [new URL(image, siteUrl()).href] : [],
    },
  };
}
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProduct((await params).slug);
  if (!p) notFound();
  const copy = await getCopy();
  const related = await db.product.findMany({
    where: {
      published: true,
      id: { not: p.id },
      categories: { some: { categoryId: { in: p.categories.map((c) => c.categoryId) } } },
    },
    include: {
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      categories: { include: { category: true } },
    },
    take: 4,
  });
  const available =
    p.inventoryMode !== 'OUT_OF_STOCK' &&
    (!p.trackInventory ||
      (p.variants.length ? p.variants.some((v) => v.enabled && v.stock > 0) : p.stock > 0));
  const offer = {
    priceCurrency: 'MKD',
    price: p.salePrice ?? p.price,
    availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    url: `${siteUrl()}/product/${p.slug}`,
  };
  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.name,
            description: p.shortDescription,
            sku: p.sku,
            image: p.images.map((i) => new URL(i.url, siteUrl()).href),
            brand: { '@type': 'Brand', name: 'GrandXStudio' },
            offers: { '@type': 'Offer', ...offer },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Shop', item: siteUrl() + '/shop' },
              {
                '@type': 'ListItem',
                position: 2,
                name: p.name,
                item: siteUrl() + '/product/' + p.slug,
              },
            ],
          }),
        }}
      />
      <div className="breadcrumbs">
        <Link href="/">{copy.home}</Link>
        <span>/</span>
        <Link href="/shop">{copy.shop}</Link>
        <span>/</span>
        <span>{p.name}</span>
      </div>
      <ProductDetail product={serialize(p)} copy={copy} />
      <div className="product-information">
        <div>
          <h2>{copy.description}</h2>
          <p className="pre-line muted">{p.description}</p>
        </div>
        <div>
          <h2>{copy.details}</h2>
          <dl>
            {p.specifications.map((s) => (
              <div key={s.id}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
          <Link className="text-link" href="/shipping">
            {copy.shipping} ↗
          </Link>
        </div>
      </div>
      {related.length > 0 && (
        <section className="related">
          <div className="section-heading">
            <h2>{copy.related}</h2>
          </div>
          <div className="product-grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} copy={copy} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

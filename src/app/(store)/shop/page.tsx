import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getCopy } from '@/lib/i18n';
import { ProductCard } from '@/components/product-card';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const c = p.category ? await db.category.findUnique({ where: { slug: p.category } }) : null;
  return {
    title: c?.name || 'Shop',
    description: c?.description || 'Explore GrandXStudio 3D printed products.',
    alternates: { canonical: p.category ? `/shop?category=${p.category}` : '/shop' },
  };
}
export default async function Shop({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const copy = await getCopy();
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const categories = await db.category.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' },
  });
  const selected = categories.find((c) => c.slug === p.category);
  const q = typeof p.q === 'string' ? p.q.slice(0, 100) : '';
  const min = Math.max(0, Math.min(10000000, Number(p.min) || 0));
  const max = Math.max(min, Math.min(10000000, Number(p.max) || 10000000));
  const parts = [
    Prisma.sql`p.published = true`,
    Prisma.sql`COALESCE(p.salePrice,p.price) BETWEEN ${min} AND ${max}`,
  ];
  if (q)
    parts.push(
      Prisma.sql`(p.name LIKE ${'%' + q.replace(/[\\%_]/g, '\\$&') + '%'} OR p.shortDescription LIKE ${'%' + q.replace(/[\\%_]/g, '\\$&') + '%'})`,
    );
  if (p.category)
    parts.push(
      Prisma.sql`EXISTS(SELECT 1 FROM ProductCategory pc JOIN Category c ON c.id=pc.categoryId WHERE pc.productId=p.id AND c.slug=${p.category} AND c.enabled=true)`,
    );
  if (p.stock === 'available')
    parts.push(
      Prisma.sql`p.inventoryMode != 'OUT_OF_STOCK' AND (p.trackInventory=false OR (EXISTS(SELECT 1 FROM ProductVariant v WHERE v.productId=p.id AND v.enabled=true AND v.stock>0)) OR (NOT EXISTS(SELECT 1 FROM ProductVariant v WHERE v.productId=p.id) AND p.stock>0))`,
    );
  const where = Prisma.join(parts, ' AND ');
  const sort =
    p.sort === 'price-asc'
      ? Prisma.sql`COALESCE(p.salePrice,p.price) ASC`
      : p.sort === 'price-desc'
        ? Prisma.sql`COALESCE(p.salePrice,p.price) DESC`
        : p.sort === 'popular'
          ? Prisma.sql`p.bestseller DESC,p.createdAt DESC`
          : Prisma.sql`p.createdAt DESC`;
  const [ids, counts] = await Promise.all([
    db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT p.id FROM Product p WHERE ${where} ORDER BY ${sort},p.id LIMIT 12 OFFSET ${(page - 1) * 12}`,
    ),
    db.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) total FROM Product p WHERE ${where}`,
    ),
  ]);
  const count = Number(counts[0].total);
  const rows = await db.product.findMany({
    where: { id: { in: ids.map((i) => i.id) } },
    include: {
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      categories: { include: { category: true } },
    },
  });
  const products = ids.map(({ id }) => rows.find((p) => p.id === id)!);
  function pageUrl(n: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(p))
      if (typeof value === 'string') params.set(key, value);
    params.set('page', String(n));
    return `/shop?${params}`;
  }
  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link href="/">{copy.home}</Link>
        <span>/</span>
        <span>{copy.shop}</span>
        {selected && (
          <>
            <span>/</span>
            <span>{selected.name}</span>
          </>
        )}
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy.collection}</p>
          <h1 className="page-title">{selected?.name || copy.shop}</h1>
          <p className="muted">{copy.featuredSub}</p>
        </div>
        <span className="small muted">
          {count} {copy.productsLabel}
        </span>
      </div>
      <form className="shop-filters">
        <div className="filter-main">
          <label>
            {copy.search}
            <input name="q" defaultValue={q} placeholder={copy.search} />
          </label>
          <label>
            {copy.categories}
            <select name="category" defaultValue={p.category || ''}>
              <option value="">{copy.all}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.sort}
            <select name="sort" defaultValue={p.sort || 'newest'}>
              <option value="newest">{copy.newest}</option>
              <option value="price-asc">{copy.lowPrice}</option>
              <option value="price-desc">{copy.highPrice}</option>
              <option value="popular">{copy.popular}</option>
            </select>
          </label>
        </div>
        <div className="filter-bottom">
          <details className="filter-extra" open={!!(p.min || p.max || p.stock)}>
            <summary>
              <SlidersHorizontal size={15} />
              {copy.moreFilters}
              <ChevronDown size={15} />
            </summary>
            <div className="filter-options">
              <label>
                Min. MKD
                <input name="min" type="number" min="0" defaultValue={p.min} />
              </label>
              <label>
                Max. MKD
                <input name="max" type="number" min="0" defaultValue={p.max} />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="stock"
                  value="available"
                  defaultChecked={p.stock === 'available'}
                />
                {copy.inStock}
              </label>
            </div>
          </details>
          <div className="filter-actions">
            <Link href="/shop" className="text-link">
              {copy.reset}
            </Link>
            <button className="button">{copy.apply}</button>
          </div>
        </div>
      </form>
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} copy={copy} />
        ))}
      </div>
      {!products.length && (
        <div className="empty">
          <p>{copy.noProducts}</p>
          <Link href="/shop" className="button outline">
            {copy.reset}
          </Link>
        </div>
      )}
      <div className="pagination">
        {page > 1 && (
          <Link href={pageUrl(page - 1)} className="button outline">
            {copy.previous}
          </Link>
        )}
        <span>
          {page} / {Math.max(1, Math.ceil(count / 12))}
        </span>
        {page * 12 < count && (
          <Link href={pageUrl(page + 1)} className="button outline">
            {copy.next}
          </Link>
        )}
      </div>
    </div>
  );
}

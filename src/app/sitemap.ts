import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { siteUrl } from '@/lib/utils';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      take: 10000,
      orderBy: { id: 'asc' },
    }),
    db.category.findMany({
      where: { enabled: true },
      select: { slug: true, updatedAt: true },
      take: 1000,
    }),
  ]);
  return [
    ...[
      '',
      '/shop',
      '/categories',
      '/custom-order',
      '/about',
      '/contact',
      '/terms',
      '/privacy',
      '/shipping',
      '/returns',
    ].map((path) => ({ url: siteUrl() + path })),
    ...products.map((p) => ({ url: `${siteUrl()}/product/${p.slug}`, lastModified: p.updatedAt })),
    ...categories.map((c) => ({
      url: `${siteUrl()}/shop?category=${c.slug}`,
      lastModified: c.updatedAt,
    })),
  ];
}

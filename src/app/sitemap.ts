import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { siteUrl } from '@/lib/utils';
import { storefrontProductWhere } from '@/lib/catalog-visibility';
import { getBlackFriday } from '@/lib/campaigns';
import { campaignStatus } from '@/lib/campaign-rules';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, campaign] = await Promise.all([
    db.product.findMany({
      where: storefrontProductWhere,
      select: { slug: true, updatedAt: true },
      take: 10000,
      orderBy: { id: 'asc' },
    }),
    db.category.findMany({
      where: { enabled: true },
      select: { slug: true, updatedAt: true },
      take: 1000,
    }),
    getBlackFriday(),
  ]);
  return [
    ...(campaignStatus(campaign) === 'active' ? [{ url: siteUrl() + '/black-friday' }] : []),
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

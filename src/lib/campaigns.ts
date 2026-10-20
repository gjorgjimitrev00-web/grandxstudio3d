import { Prisma } from '@prisma/client';
import { cache } from 'react';
import { db } from './db';
import {
  blackFridaySchema,
  defaultBlackFriday,
  campaignStatus,
  type BlackFriday,
} from './campaign-rules';
import { HttpError, readJson } from './security';

export async function blackFridaySettings(tx: Prisma.TransactionClient = db) {
  if (!process.env.DATABASE_URL) return defaultBlackFriday;
  const row = await tx.storeSetting.findUnique({ where: { key: 'blackFriday' } });
  return row ? blackFridaySchema.parse(JSON.parse(row.value)) : defaultBlackFriday;
}
// Request memoization only; the next request always reads the latest switch and dates.
export const getBlackFriday = cache(() => blackFridaySettings());

export function campaignMatchSql(c: BlackFriday, now = new Date()) {
  if (campaignStatus(c, now) !== 'active') return Prisma.sql`false`;
  const matches: Prisma.Sql[] = [];
  if (c.productIds.length) matches.push(Prisma.sql`p.id IN (${Prisma.join(c.productIds)})`);
  if (c.categoryIds.length)
    matches.push(Prisma.sql`EXISTS (
      SELECT 1 FROM ProductCategory offerPc
      WHERE offerPc.productId = p.id AND offerPc.categoryId IN (${Prisma.join(c.categoryIds)})
    )`);
  return matches.length ? Prisma.sql`(${Prisma.join(matches, ' OR ')})` : Prisma.sql`false`;
}

export function catalogPriceSql(c: BlackFriday, now = new Date()) {
  return Prisma.sql`CASE WHEN ${campaignMatchSql(c, now)}
    THEN LEAST(COALESCE(p.salePrice,p.price), FLOOR((p.price * ${100 - c.discountPercent} + 50) / 100))
    ELSE COALESCE(p.salePrice,p.price) END`;
}

export async function campaignsAdminRequest(request: Request, id?: string) {
  if (id !== 'black-friday') throw new HttpError(404, 'Campaign not found.');
  if (request.method === 'PATCH') {
    // A separate emergency stop preserves all saved dates and selections.
    const data = await readJson(request);
    if (!data || typeof data !== 'object' || !('enabled' in data) || data.enabled !== false)
      throw new HttpError(400, 'Use Save campaign to enable a validated schedule.');
    const settings = { ...(await blackFridaySettings()), enabled: false };
    return saveCampaign(settings);
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'Method not allowed.');
  const settings = blackFridaySchema.parse(await readJson(request));
  settings.productIds = [...new Set(settings.productIds)];
  settings.categoryIds = [...new Set(settings.categoryIds)];
  const [products, categories] = await Promise.all([
    db.product.count({ where: { id: { in: settings.productIds } } }),
    db.category.count({ where: { id: { in: settings.categoryIds } } }),
  ]);
  if (products !== settings.productIds.length || categories !== settings.categoryIds.length)
    throw new HttpError(400, 'Some selections no longer exist. Refresh and choose again.');
  return saveCampaign(settings);
}

async function saveCampaign(settings: BlackFriday) {
  const value = JSON.stringify(settings);
  await db.storeSetting.upsert({
    where: { key: 'blackFriday' },
    create: { key: 'blackFriday', value },
    update: { value },
  });
  return { ok: true };
}

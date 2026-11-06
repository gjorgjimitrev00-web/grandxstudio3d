import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { FRAME_SIZES, type FrameSize } from './frame-artwork';
import type { FramePrices } from './frame-price-rules';
import { HttpError } from './security';

const key = 'framePrices';
const price = z.number().int().min(1).max(1000000);
const priceTable = z.partialRecord(
  z.enum(Object.keys(FRAME_SIZES) as [FrameSize, ...FrameSize[]]),
  z.object({ glossy: price.optional(), matte: price.optional() }).strict(),
);
export const framePriceUpdate = z
  .object({
    prices: priceTable,
    revision: z.string().length(64),
  })
  .strict();
const revisionOf = (raw: string | null) =>
  createHash('sha256')
    .update(raw ?? 'unset')
    .digest('hex');

export async function framePriceSettings(client: Prisma.TransactionClient = db) {
  const row = await client.storeSetting.findUnique({ where: { key } });
  return {
    prices: row ? priceTable.parse(JSON.parse(row.value)) : {},
    revision: revisionOf(row?.value ?? null),
  };
}

export async function getFramePrices(client: Prisma.TransactionClient = db): Promise<FramePrices> {
  return (await framePriceSettings(client)).prices;
}

export async function saveFramePrices(input: z.infer<typeof framePriceUpdate>) {
  const value = JSON.stringify(input.prices);
  const row = await db.storeSetting.findUnique({ where: { key } });
  const conflict = () => new HttpError(409, 'Prices changed. Reload this page before saving.');
  if (revisionOf(row?.value ?? null) !== input.revision) throw conflict();
  if (row) {
    const change = await db.storeSetting.updateMany({
      where: { key, value: row.value },
      data: { value },
    });
    if (!change.count) throw conflict();
  } else {
    try {
      await db.storeSetting.create({ data: { key, value } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw conflict();
      throw error;
    }
  }
  return revisionOf(value);
}

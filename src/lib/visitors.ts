import { Prisma } from '@prisma/client';
import { db } from './db';
import { shiftDay, studioDay } from './time';
import { VISITOR_RETENTION_DAYS, type visitIdentity } from './visitor-rules';
import { visitorCity } from './visitor-geo';

let lastPrunedAt = 0;
export async function pruneVisitors(now = new Date()) {
  if (now.getTime() - lastPrunedAt < 3600000) return;
  await db.visitorDay.deleteMany({
    where: { day: { lt: shiftDay(studioDay(now), -(VISITOR_RETENTION_DAYS - 1)) } },
  });
  lastPrunedAt = now.getTime();
}

export async function recordVisitor(
  identity: NonNullable<ReturnType<typeof visitIdentity>>,
  now = new Date(),
) {
  const { day, visitorHash, ip } = identity;
  const location = visitorCity(ip);
  const where = { day_visitorHash: { day, visitorHash } };
  const update = { lastSeenAt: now };
  await db.visitorDay
    .upsert({
      where,
      create: { day, visitorHash, ...location, firstSeenAt: now, lastSeenAt: now },
      update,
    })
    .catch(async (error) => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      await db.visitorDay.update({ where, data: update });
    });
  await pruneVisitors(now);
}

export async function visitorReport(day = studioDay()) {
  await pruneVisitors();
  const start = shiftDay(day, -6);
  const [total, macedonia, cities, daily] = await Promise.all([
    db.visitorDay.count({ where: { day } }),
    db.visitorDay.count({ where: { day, country: 'MK' } }),
    db.visitorDay.groupBy({
      by: ['city'],
      where: { day, country: 'MK' },
      _count: true,
      orderBy: { _count: { city: 'desc' } },
    }),
    db.visitorDay.groupBy({
      by: ['day'],
      where: { day: { gte: start, lte: day } },
      _count: true,
      orderBy: { day: 'asc' },
    }),
  ]);
  return {
    total,
    macedonia,
    unknown: total - macedonia,
    cities,
    daily: Array.from({ length: 7 }, (_, i) => {
      const date = shiftDay(start, i);
      return { day: date, visitors: daily.find((row) => row.day === date)?._count || 0 };
    }),
  };
}

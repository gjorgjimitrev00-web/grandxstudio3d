import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const now = new Date();
  const [sessions, limits] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  console.log(
    `Removed ${sessions.count} expired sessions and ${limits.count} expired rate-limit buckets.`,
  );
}
main().finally(() => db.$disconnect());

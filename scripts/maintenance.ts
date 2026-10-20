import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { shiftDay, studioDay } from '../src/lib/time';
import { VISITOR_RETENTION_DAYS } from '../src/lib/visitor-rules';
const db = new PrismaClient();
async function main() {
  const now = new Date();
  const [sessions, limits, chats, visitors] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.chatConversation.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.visitorDay.deleteMany({
      where: { day: { lt: shiftDay(studioDay(now), -(VISITOR_RETENTION_DAYS - 1)) } },
    }),
  ]);
  console.log(
    `Removed ${sessions.count} expired sessions, ${limits.count} expired rate-limit buckets, ${chats.count} expired chat conversations and ${visitors.count} expired daily visitor records.`,
  );
}
main().finally(() => db.$disconnect());

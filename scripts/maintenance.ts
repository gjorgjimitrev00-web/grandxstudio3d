import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const now = new Date();
  const [sessions, limits, chats] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.chatConversation.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  console.log(
    `Removed ${sessions.count} expired sessions, ${limits.count} expired rate-limit buckets and ${chats.count} expired chat conversations.`,
  );
}
main().finally(() => db.$disconnect());

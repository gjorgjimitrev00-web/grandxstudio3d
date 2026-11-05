import { assistantSettings, assistantConfigured } from '@/lib/chat-ai-config';
import { z } from 'zod';
import { db } from '@/lib/db';
import { chatAvailability, chatConversationSelect, chatResponse } from '@/lib/chat';
import {
  errorResponse,
  HttpError,
  originCheck,
  rateLimit,
  readJson,
  requireAdmin,
} from '@/lib/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    await rateLimit(request, 'admin-chat-read', 120, 60, user.id);
    const { page, status } = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        status: z.enum(['OPEN', 'CLOSED', 'ALL']).default('OPEN'),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = {
      expiresAt: { gt: new Date() },
      messageCount: { gt: 0 },
      ...(status === 'ALL' ? {} : { status }),
    };
    const [conversations, count, availability] = await Promise.all([
      db.chatConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
        select: chatConversationSelect,
      }),
      db.chatConversation.count({ where }),
      chatAvailability(),
    ]);
    return chatResponse({ conversations, count, ...availability, ...(await assistantSettings()) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    originCheck(request);
    const user = await requireAdmin();
    await rateLimit(request, 'chat-presence', 12, 60, user.id);
    const { available } = z.object({ available: z.boolean() }).parse(await readJson(request));
    if (available)
      await db.chatPresence.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: { lastSeenAt: new Date() },
      });
    else await db.chatPresence.deleteMany({ where: { userId: user.id } });
    return chatResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    originCheck(request);
    const user = await requireAdmin();
    await rateLimit(request, 'chat-settings', 20, 60, user.id);
    const input = z
      .union([z.object({ enabled: z.boolean() }), z.object({ aiEnabled: z.boolean() })])
      .parse(await readJson(request));
    const isAi = 'aiEnabled' in input;
    const enabled = isAi ? input.aiEnabled : input.enabled;
    if (isAi && enabled && !assistantConfigured())
      throw new HttpError(400, 'Add OPENAI_API_KEY in hosting environment variables first.');
    const key = isAi ? 'chatAiEnabled' : 'chatEnabled';
    await db.storeSetting.upsert({
      where: { key },
      create: { key, value: String(enabled) },
      update: { value: String(enabled) },
    });
    return chatResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

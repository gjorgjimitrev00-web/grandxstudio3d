import { z } from 'zod';
import { db } from '@/lib/db';
import {
  chatConversationSelect,
  chatMessages,
  chatResponse,
  markChatRead,
  sendChatMessage,
} from '@/lib/chat';
import { chatReadSchema } from '@/lib/chat-contract';
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
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireAdmin();
    await rateLimit(request, 'admin-chat-detail', 120, 60, user.id);
    const { id } = await context.params;
    const conversation = await db.chatConversation.findFirst({
      where: { id, expiresAt: { gt: new Date() } },
      select: chatConversationSelect,
    });
    if (!conversation) throw new HttpError(404, 'Conversation not found.');
    return chatResponse({ conversation, ...(await chatMessages(id, request)) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    originCheck(request);
    const user = await requireAdmin();
    await rateLimit(request, 'admin-chat-send', 120, 300, user.id);
    return chatResponse({
      message: await sendChatMessage((await context.params).id, 'ADMIN', await readJson(request)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    originCheck(request);
    const user = await requireAdmin();
    await rateLimit(request, 'admin-chat-update', 120, 60, user.id);
    const { id } = await context.params;
    const input = z
      .union([
        chatReadSchema,
        z.object({
          status: z.enum(['OPEN', 'CLOSED']),
          expectedLastVisitorMessageId: z.number().int().min(0),
        }),
      ])
      .parse(await readJson(request));
    if ('through' in input) await markChatRead(id, 'ADMIN', input.through);
    else {
      const result = await db.chatConversation.updateMany({
        where: { id, lastVisitorMessageId: input.expectedLastVisitorMessageId },
        data: { status: input.status },
      });
      if (!result.count)
        throw new HttpError(
          409,
          'A new message arrived. Read it before changing the conversation status.',
        );
    }
    return chatResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

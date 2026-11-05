import { z } from 'zod';
import { db } from '@/lib/db';
import { replyToVisitor } from '@/lib/chat-ai';
import {
  chatAvailability,
  chatMessages,
  chatResponse,
  initializeChat,
  markChatRead,
  sendVisitorMessage,
  visitorConversation,
  visitorHash,
} from '@/lib/chat';
import { chatReadSchema } from '@/lib/chat-contract';
import { errorResponse, HttpError, originCheck, rateLimit, readJson } from '@/lib/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const token = await visitorHash();
    if (token) await rateLimit(request, 'chat-read', 120, 60, token);
    const conversation = token ? await visitorConversation(token) : null;
    return chatResponse({
      ...(await chatAvailability()),
      conversation,
      ...(conversation
        ? await chatMessages(conversation.id, request)
        : { messages: [], hasMore: false }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    originCheck(request);
    const input = await readJson(request);
    if (input?.action === 'initialize') {
      if (!(await visitorHash())) await rateLimit(request, 'chat-session', 300, 3600);
      await initializeChat();
      return chatResponse({ ok: true });
    }
    const token = await visitorHash();
    if (!token) throw new HttpError(401, 'Open chat again to start a session.');
    await rateLimit(request, 'chat-send', 30, 300, token);
    const message = await sendVisitorMessage(token, input, request);
    const conversation = await visitorConversation(token);
    if (conversation) await replyToVisitor(conversation.id, message.id, request);
    return chatResponse({ message });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    originCheck(request);
    const token = await visitorHash();
    const conversation = token ? await visitorConversation(token) : null;
    if (!conversation) throw new HttpError(401, 'Chat session not found.');
    await rateLimit(request, 'chat-mark-read', 120, 60, token!);
    const input = z
      .union([
        chatReadSchema,
        z.object({ action: z.literal('human') }),
        z.object({ aiConsent: z.boolean() }),
      ])
      .parse(await readJson(request));
    if ('through' in input) await markChatRead(conversation.id, 'VISITOR', input.through);
    else
      await db.chatConversation.update({
        where: { id: conversation.id },
        data: {
          ...('action' in input ? { aiPaused: true } : { aiConsent: input.aiConsent }),
          aiVersion: { increment: 1 },
        },
      });
    return chatResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

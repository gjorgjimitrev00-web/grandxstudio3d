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
    return chatResponse({ message: await sendVisitorMessage(token, input, request) });
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
    const { through } = chatReadSchema.parse(await readJson(request));
    await markChatRead(conversation.id, 'VISITOR', through);
    return chatResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

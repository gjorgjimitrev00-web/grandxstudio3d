import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { ChatSender, Prisma } from '@prisma/client';
import { db } from './db';
import { hash, HttpError, rateLimit } from './security';
import {
  CHAT_LIFETIME_SECONDS,
  CHAT_MESSAGE_LIMIT,
  CHAT_PRESENCE_MS,
  chatMessageSchema,
  chatPageSchema,
  chatStartSchema,
} from './chat-contract';

const COOKIE = 'gx-chat';
export const chatConversationSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  preview: true,
  lastVisitorMessageId: true,
  lastAdminMessageId: true,
  adminReadThrough: true,
  visitorReadThrough: true,
  messageCount: true,
  lastMessageAt: true,
} satisfies Prisma.ChatConversationSelect;
const messageSelect = {
  id: true,
  sender: true,
  text: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

export const chatResponse = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  });
export async function chatAvailability() {
  const [setting, presence] = await Promise.all([
    db.storeSetting.findUnique({ where: { key: 'chatEnabled' } }),
    db.chatPresence.findFirst({
      where: {
        lastSeenAt: { gt: new Date(Date.now() - CHAT_PRESENCE_MS) },
        user: { role: 'ADMIN' },
      },
      select: { userId: true },
    }),
  ]);
  return { enabled: setting?.value !== 'false', online: !!presence && setting?.value !== 'false' };
}
export async function visitorHash() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? hash(token) : null;
}
export async function initializeChat() {
  const jar = await cookies();
  const existing = await visitorHash();
  if (existing) {
    const conversation = await db.chatConversation.findUnique({
      where: { visitorTokenHash: existing },
    });
    if (!conversation || conversation.expiresAt > new Date()) return;
  }
  jar.set(COOKIE, randomBytes(32).toString('hex'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/chat',
    maxAge: CHAT_LIFETIME_SECONDS,
  });
}
export async function visitorConversation(tokenHash: string) {
  return db.chatConversation.findFirst({
    where: { visitorTokenHash: tokenHash, expiresAt: { gt: new Date() } },
    select: chatConversationSelect,
  });
}
export async function chatMessages(conversationId: string, request: Request) {
  const query = chatPageSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const forward = query.after !== undefined;
  const rows = await db.chatMessage.findMany({
    where: {
      conversationId,
      ...(forward ? { id: { gt: query.after } } : query.before ? { id: { lt: query.before } } : {}),
    },
    orderBy: { id: forward ? 'asc' : 'desc' },
    take: 51,
    select: messageSelect,
  });
  const messages = rows.slice(0, 50);
  return { messages: forward ? messages : messages.reverse(), hasMore: rows.length > 50 };
}

export async function sendChatMessage(conversationId: string, sender: ChatSender, raw: unknown) {
  const input = chatMessageSchema.parse(raw);
  return db.$transaction(
    async (tx) => {
      // Lock the conversation first so concurrent sends and retries keep counters in order.
      const locked = await tx.chatConversation.updateMany({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      if (!locked.count) throw new HttpError(404, 'Conversation not found.');
      const conversation = await tx.chatConversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      const existing = await tx.chatMessage.findUnique({
        where: { conversationId_clientId: { conversationId, clientId: input.clientId } },
        select: messageSelect,
      });
      if (existing) {
        if (existing.sender !== sender)
          throw new HttpError(409, 'Message identifier is already in use.');
        return existing;
      }
      if (conversation.expiresAt <= new Date())
        throw new HttpError(410, 'This conversation has expired. Start a new chat.');
      if (conversation.messageCount >= CHAT_MESSAGE_LIMIT)
        throw new HttpError(409, 'This conversation is full. Please use the contact form.');
      const message = await tx.chatMessage.create({
        data: { conversationId, sender, ...input },
        select: messageSelect,
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: {
          status: 'OPEN',
          preview: input.text.slice(0, 200),
          lastMessageAt: message.createdAt,
          messageCount: { increment: 1 },
          ...(sender === 'VISITOR'
            ? { lastVisitorMessageId: message.id }
            : { lastAdminMessageId: message.id }),
        },
      });
      return message;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
export async function sendVisitorMessage(tokenHash: string, raw: unknown, request: Request) {
  if (!(await chatAvailability()).enabled)
    throw new HttpError(503, 'Chat is unavailable. Please use the contact form.');
  let conversation = await visitorConversation(tokenHash);
  if (!conversation) {
    const input = chatStartSchema.parse(raw);
    await rateLimit(request, 'chat-new-conversation', 300, 3600);
    // Upsert makes concurrent first messages from this browser share one conversation.
    conversation = await db.chatConversation
      .upsert({
        where: { visitorTokenHash: tokenHash },
        update: {},
        create: {
          visitorTokenHash: tokenHash,
          name: input.name,
          email: input.email,
          preview: '',
          expiresAt: new Date(Date.now() + CHAT_LIFETIME_SECONDS * 1000),
        },
        select: chatConversationSelect,
      })
      .catch(async (error) => {
        // MySQL may race two initial upserts before either inserts the unique token.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
        return db.chatConversation.findUniqueOrThrow({
          where: { visitorTokenHash: tokenHash },
          select: chatConversationSelect,
        });
      });
  }
  return sendChatMessage(conversation.id, 'VISITOR', raw);
}
export async function markChatRead(
  conversationId: string,
  reader: 'VISITOR' | 'ADMIN',
  through: number,
) {
  const last = await db.chatMessage.findFirst({
    where: {
      conversationId,
      sender: reader === 'ADMIN' ? 'VISITOR' : 'ADMIN',
      id: { lte: through },
    },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  if (last) {
    const field = reader === 'ADMIN' ? 'adminReadThrough' : 'visitorReadThrough';
    await db.chatConversation.updateMany({
      where: { id: conversationId, [field]: { lt: last.id } },
      data: { [field]: last.id },
    });
  }
}

import { z } from 'zod';

export const CHAT_LIFETIME_SECONDS = 30 * 86400;
export const CHAT_PRESENCE_MS = 75000;
export const CHAT_MESSAGE_LIMIT = 1000;
export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, 'Enter a message.').max(2000),
  clientId: z.uuid(),
});
export const chatStartSchema = chatMessageSchema.extend({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(191)),
  consent: z.literal(true),
  website: z.string().max(0).optional(),
});
export const chatReadSchema = z.object({ through: z.number().int().min(0).max(2147483647) });
export const chatPageSchema = z
  .object({
    after: z.coerce.number().int().min(0).max(2147483647).optional(),
    before: z.coerce.number().int().min(1).max(2147483647).optional(),
  })
  .refine((v) => v.after === undefined || v.before === undefined, 'Use one message cursor.');

export type ChatMessageView = {
  id: number;
  sender: 'VISITOR' | 'ADMIN';
  text: string;
  createdAt: string;
};
export type ChatConversationView = {
  id: string;
  name: string;
  email: string;
  status: 'OPEN' | 'CLOSED';
  preview: string;
  lastVisitorMessageId: number;
  lastAdminMessageId: number;
  adminReadThrough: number;
  visitorReadThrough: number;
  messageCount: number;
  lastMessageAt: string;
};
export type ChatSnapshot = {
  conversation: ChatConversationView | null;
  messages: ChatMessageView[];
  hasMore: boolean;
  enabled?: boolean;
  online?: boolean;
};

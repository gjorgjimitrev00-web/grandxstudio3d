import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { storefrontProductWhere } from './catalog-visibility';
import { blackFridaySettings } from './campaigns';
import { productPrice, withCampaign } from './campaign-rules';
import { assistantConfigured, assistantModel, assistantSettings } from './chat-ai-config';
import { requestAssistantReply } from './chat-ai-client';
import { CHAT_MESSAGE_LIMIT } from './chat-contract';
import { rateLimit } from './security';

export async function assistantShopContext() {
  // Explicit public projection: never load users, orders, visitor identity or private settings.
  const [products, policies, campaign] = await Promise.all([
    db.product.findMany({
      where: storefrontProductWhere,
      take: 80,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        price: true,
        salePrice: true,
        inventoryMode: true,
        stock: true,
        trackInventory: true,
        categories: { select: { categoryId: true } },
        _count: { select: { variants: true } },
      },
    }),
    db.storeSetting.findMany({
      where: { key: { in: ['shipping', 'returns', 'terms', 'about'] } },
      select: { key: true, value: true },
    }),
    blackFridaySettings(),
  ]);
  return JSON.stringify({
    store: 'GrandXStudio',
    currency: 'MKD',
    links: {
      shop: '/shop',
      customOrders: '/custom-order',
      contact: '/contact',
      shipping: '/shipping',
      returns: '/returns',
      rewards: '/rewards',
    },
    policies: Object.fromEntries(policies.map((p) => [p.key, p.value.slice(0, 3500)])),
    catalogMayBePartial: products.length === 80,
    products: products.map((p) => ({
      name: p.name,
      url: `/product/${p.slug}`,
      description: p.shortDescription.slice(0, 250),
      price: productPrice(withCampaign(p, campaign)).price,
      hasVariants: p._count.variants > 0,
      availability:
        p._count.variants > 0
          ? 'Check options on product page'
          : p.inventoryMode === 'OUT_OF_STOCK' ||
              (p.inventoryMode === 'IN_STOCK' && p.trackInventory && p.stock <= 0)
            ? 'Out of stock'
            : p.inventoryMode === 'MADE_TO_ORDER'
              ? 'Made to order'
              : 'In stock',
    })),
  });
}

const unavailableReply = {
  text: 'AI асистентот моментално не може да одговори. Пораката е зачувана за тимот. / The AI assistant is unavailable. Your message is saved for the studio team.',
  handoff: true,
};

const humanRequested = (text: string) =>
  /(?:human|real person|live agent|speak to (?:an? )?(?:agent|person)|човек|оператор|администратор|c[h]?ovek|operator|administrator)/i.test(
    text,
  );
const dailyLimit = () => {
  const configured = Number(process.env.OPENAI_CHAT_DAILY_LIMIT || 300);
  return Number.isInteger(configured) && configured > 0 && configured <= 10000 ? configured : 300;
};

export async function replyToVisitor(
  conversationId: string,
  messageId: number,
  request: Request,
  client: typeof requestAssistantReply = requestAssistantReply,
) {
  // AI is optional. Failures must never turn a successfully saved customer message into a failed send.
  try {
    const settings = await assistantSettings();
    if (!assistantConfigured() || !settings.aiSettingEnabled) return;
    const chatEnabled = await db.storeSetting.findUnique({ where: { key: 'chatEnabled' } });
    if (chatEnabled?.value === 'false') return;
    const conversation = await db.chatConversation.findUnique({ where: { id: conversationId } });
    if (
      !conversation ||
      !conversation.aiConsent ||
      conversation.aiPaused ||
      conversation.status !== 'OPEN' ||
      conversation.expiresAt <= new Date()
    )
      return;
    const target = await db.chatMessage.findFirst({
      where: { id: messageId, conversationId, sender: 'VISITOR' },
      select: { text: true },
    });
    if (!target) return;
    let version = conversation.aiVersion;
    // One paid call per visitor message, across processes and retry requests. A newer send wins.
    const claim = await db.chatConversation.updateMany({
      where: {
        id: conversationId,
        aiVersion: version,
        aiConsent: true,
        aiPaused: false,
        status: 'OPEN',
        expiresAt: { gt: new Date() },
        lastVisitorMessageId: messageId,
        aiLastProcessedId: { lt: messageId },
        messageCount: { lt: CHAT_MESSAGE_LIMIT },
      },
      data: { aiLastProcessedId: messageId, aiClaimedAt: new Date() },
    });
    let recovered = false;
    if (!claim.count) {
      // A worker may have stopped after claiming. Retrying an abandoned turn hands it
      // to the studio without making another paid request; versioning cancels late replies.
      const recovery = await db.chatConversation.updateMany({
        where: {
          id: conversationId,
          aiVersion: version,
          aiConsent: true,
          aiPaused: false,
          status: 'OPEN',
          expiresAt: { gt: new Date() },
          lastVisitorMessageId: messageId,
          aiLastProcessedId: messageId,
          aiClaimedAt: { lt: new Date(Date.now() - 30000) },
          messageCount: { lt: CHAT_MESSAGE_LIMIT },
        },
        data: { aiVersion: { increment: 1 }, aiClaimedAt: new Date() },
      });
      if (!recovery.count) return;
      version++;
      recovered = true;
    }
    let answer: { text: string; handoff: boolean };
    try {
      if (recovered) {
        answer = unavailableReply;
      } else if (humanRequested(target.text)) {
        answer = {
          text: 'Ќе продолжите со тимот на GrandXStudio тука. / The GrandXStudio team will continue this conversation here.',
          handoff: true,
        };
      } else {
        await rateLimit(request, 'chat-ai-conversation', 20, 86400, conversationId);
        await rateLimit(request, 'chat-ai-ip', 10, 60);
        await rateLimit(request, 'chat-ai-global', dailyLimit(), 86400, 'store');
        const [context, history] = await Promise.all([
          assistantShopContext(),
          db.chatMessage.findMany({
            where: { conversationId, id: { lte: messageId } },
            orderBy: { id: 'desc' },
            take: 12,
            select: { sender: true, text: true },
          }),
        ]);
        answer = await client({
          apiKey: process.env.OPENAI_API_KEY!,
          model: assistantModel(),
          context,
          messages: history.reverse(),
        });
      }
    } catch {
      answer = unavailableReply;
    }
    await db.$transaction(
      async (tx) => {
        // Serialize against admin takeover, consent withdrawal, close, and newer visitor sends.
        const locked = await tx.chatConversation.updateMany({
          where: {
            id: conversationId,
            aiVersion: version,
            aiConsent: true,
            aiPaused: false,
            status: 'OPEN',
            expiresAt: { gt: new Date() },
            lastVisitorMessageId: messageId,
            aiLastProcessedId: messageId,
            messageCount: { lt: CHAT_MESSAGE_LIMIT },
          },
          data: { updatedAt: new Date() },
        });
        if (!locked.count) return;
        const switches = await tx.storeSetting.findMany({
          where: { key: { in: ['chatEnabled', 'chatAiEnabled'] } },
        });
        if (
          switches.find((s) => s.key === 'chatEnabled')?.value === 'false' ||
          switches.find((s) => s.key === 'chatAiEnabled')?.value !== 'true'
        )
          return;
        const message = await tx.chatMessage.create({
          data: { conversationId, sender: 'AI', text: answer.text, clientId: randomUUID() },
        });
        await tx.chatConversation.update({
          where: { id: conversationId },
          data: {
            aiClaimedAt: null,
            preview: answer.text.slice(0, 200),
            lastMessageAt: message.createdAt,
            lastAdminMessageId: message.id,
            messageCount: { increment: 1 },
            ...(answer.handoff ? { aiPaused: true, aiVersion: { increment: 1 } } : {}),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch {
    console.error('AI chat could not finish; customer message remains in the inbox.');
  }
}

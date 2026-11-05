import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../../src/lib/db';
import { replyToVisitor, assistantShopContext } from '../../src/lib/chat-ai';
import { sendChatMessage } from '../../src/lib/chat';
import { defaultBlackFriday } from '../../src/lib/campaign-rules';
import type { requestAssistantReply } from '../../src/lib/chat-ai-client';

const database = new URL(process.env.DATABASE_URL || 'http://invalid');
if (database.hostname !== '127.0.0.1' || !/preview|test/.test(database.pathname)) {
  throw new Error('AI chat tests require an isolated disposable local test/preview database.');
}
const tag = `ai-qa-${randomUUID()}`;
const email = `${tag}@example.test`;
const request = new Request('http://127.0.0.1:3000/api/chat', {
  headers: { 'x-forwarded-for': tag },
});
const previousKey = process.env.OPENAI_API_KEY;
const previousLimit = process.env.OPENAI_CHAT_DAILY_LIMIT;
const previousProxy = process.env.TRUST_PROXY;
const previousSettings = new Map<string, string | undefined>();
const privateSetting = `private-${tag}`;
let hiddenCategoryId = '';
const productIds: string[] = [];
const settingKeys = ['chatEnabled', 'chatAiEnabled', 'blackFriday', privateSetting];

async function setting(key: string, value: string) {
  await db.storeSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
async function conversation(text = 'Која е цената на вазната?', aiConsent = true) {
  const c = await db.chatConversation.create({
    data: {
      visitorTokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
      name: 'Private visitor identity',
      email,
      preview: '',
      aiConsent,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const message = await sendChatMessage(c.id, 'VISITOR', { text, clientId: randomUUID() });
  return { id: c.id, messageId: message.id };
}
const aiMessages = (id: string) =>
  db.chatMessage.findMany({ where: { conversationId: id, sender: 'AI' } });
const immediate: typeof requestAssistantReply = async () => ({
  text: 'Цената е 500 денари.',
  handoff: false,
});
function heldReply() {
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client: typeof requestAssistantReply = async () => {
    started();
    await gate;
    return { text: 'This delayed answer must be discarded.', handoff: false };
  };
  return { entered, release, client };
}

before(async () => {
  for (const key of settingKeys)
    previousSettings.set(key, (await db.storeSetting.findUnique({ where: { key } }))?.value);
  process.env.OPENAI_API_KEY = 'test-only-key-never-sent';
  process.env.OPENAI_CHAT_DAILY_LIMIT = '10000';
  process.env.TRUST_PROXY = 'true';
  await setting('chatEnabled', 'true');
  await setting('chatAiEnabled', 'true');
  await setting('blackFriday', JSON.stringify(defaultBlackFriday));
  await setting(privateSetting, 'private-value-must-not-reach-model');
  hiddenCategoryId = (
    await db.category.create({
      data: {
        name: tag,
        slug: tag,
        description: '',
        enabled: false,
      },
    })
  ).id;
  for (const kind of ['public', 'draft', 'hidden-category']) {
    const product = await db.product.create({
      data: {
        name: `${tag}-${kind}`,
        slug: `${tag}-${kind}`,
        sku: `${tag}-${kind}`,
        shortDescription: 'Public product details',
        description: 'Long product description',
        price: 500,
        salePrice: 450,
        published: kind !== 'draft',
        ...(kind === 'hidden-category'
          ? { categories: { create: { categoryId: hiddenCategoryId } } }
          : {}),
      },
    });
    productIds.push(product.id);
  }
});
after(async () => {
  await db.chatConversation.deleteMany({ where: { email } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  if (hiddenCategoryId) await db.category.deleteMany({ where: { id: hiddenCategoryId } });
  for (const [key, value] of previousSettings) {
    if (value === undefined) await db.storeSetting.deleteMany({ where: { key } });
    else await setting(key, value);
  }
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  if (previousLimit === undefined) delete process.env.OPENAI_CHAT_DAILY_LIMIT;
  else process.env.OPENAI_CHAT_DAILY_LIMIT = previousLimit;
  if (previousProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = previousProxy;
  await db.$disconnect();
});

test('shop context excludes unpublished/disabled products and private settings', async () => {
  const text = await assistantShopContext();
  const context = JSON.parse(text);
  assert.ok(
    context.products.some(
      (p: { name: string; price: number }) => p.name === `${tag}-public` && p.price === 450,
    ),
  );
  assert.equal(text.includes(`${tag}-draft`), false);
  assert.equal(text.includes(`${tag}-hidden-category`), false);
  assert.equal(text.includes('private-value-must-not-reach-model'), false);
  assert.equal(text.includes('Private visitor identity'), false);
});

test('consent, server key and both switches gate paid calls', async () => {
  let calls = 0;
  const client: typeof requestAssistantReply = async () => {
    calls++;
    return immediate({} as never);
  };
  const noConsent = await conversation('A general product question', false);
  await replyToVisitor(noConsent.id, noConsent.messageId, request, client);
  const missingKey = await conversation();
  delete process.env.OPENAI_API_KEY;
  await replyToVisitor(missingKey.id, missingKey.messageId, request, client);
  process.env.OPENAI_API_KEY = 'test-only-key-never-sent';
  const disabled = await conversation();
  await setting('chatAiEnabled', 'false');
  await replyToVisitor(disabled.id, disabled.messageId, request, client);
  await setting('chatAiEnabled', 'true');
  await setting('chatEnabled', 'false');
  await replyToVisitor(disabled.id, disabled.messageId, request, client);
  await setting('chatEnabled', 'true');
  assert.equal(calls, 0);
  for (const c of [noConsent, missingKey, disabled])
    assert.equal((await aiMessages(c.id)).length, 0);
});

test('concurrent retries of one visitor message make one paid call and one reply', async () => {
  const c = await conversation();
  let calls = 0;
  const client: typeof requestAssistantReply = async () => {
    calls++;
    return { text: 'Еден одговор.', handoff: false };
  };
  await Promise.all(
    Array.from({ length: 3 }, () => replyToVisitor(c.id, c.messageId, request, client)),
  );
  assert.equal(calls, 1);
  const replies = await aiMessages(c.id);
  assert.equal(replies.length, 1);
  const stored = await db.chatConversation.findUniqueOrThrow({ where: { id: c.id } });
  assert.equal(stored.messageCount, 2);
  assert.equal(stored.lastAdminMessageId, replies[0].id);
});

test(
  'admin reply invalidates a pending AI answer and takes over the conversation',
  { timeout: 15000 },
  async () => {
    const c = await conversation();
    const held = heldReply();
    const work = replyToVisitor(c.id, c.messageId, request, held.client);
    await held.entered;
    await sendChatMessage(c.id, 'ADMIN', { text: 'A real studio reply.', clientId: randomUUID() });
    held.release();
    await work;
    assert.equal((await aiMessages(c.id)).length, 0);
    assert.equal(
      (await db.chatConversation.findUniqueOrThrow({ where: { id: c.id } })).aiPaused,
      true,
    );
  },
);

test(
  'pause then resume cannot revive an AI answer generated before takeover',
  { timeout: 15000 },
  async () => {
    const c = await conversation();
    const held = heldReply();
    const work = replyToVisitor(c.id, c.messageId, request, held.client);
    await held.entered;
    await db.chatConversation.update({
      where: { id: c.id },
      data: { aiPaused: true, aiVersion: { increment: 1 } },
    });
    await db.chatConversation.update({
      where: { id: c.id },
      data: { aiPaused: false, aiVersion: { increment: 1 } },
    });
    held.release();
    await work;
    assert.equal((await aiMessages(c.id)).length, 0);
  },
);

test('newer visitor messages supersede an in-flight answer', { timeout: 15000 }, async () => {
  const c = await conversation();
  const held = heldReply();
  const work = replyToVisitor(c.id, c.messageId, request, held.client);
  await held.entered;
  const latest = await sendChatMessage(c.id, 'VISITOR', {
    text: 'Actually, what is the shipping fee?',
    clientId: randomUUID(),
  });
  await replyToVisitor(c.id, latest.id, request, immediate);
  held.release();
  await work;
  const replies = await aiMessages(c.id);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].text, 'Цената е 500 денари.');
});

test('human requests bypass the model and errors preserve the message for the studio', async () => {
  let calls = 0;
  const client: typeof requestAssistantReply = async () => {
    calls++;
    throw new Error('provider private diagnostics');
  };
  const human = await conversation('Сакам да разговарам со човек');
  await replyToVisitor(human.id, human.messageId, request, client);
  assert.equal(calls, 0);
  assert.equal(
    (await db.chatConversation.findUniqueOrThrow({ where: { id: human.id } })).aiPaused,
    true,
  );
  const failed = await conversation();
  await replyToVisitor(failed.id, failed.messageId, request, client);
  assert.equal(calls, 1);
  const messages = await db.chatMessage.findMany({
    where: { conversationId: failed.id },
    orderBy: { id: 'asc' },
  });
  assert.equal(messages[0].sender, 'VISITOR');
  assert.equal(messages[1].sender, 'AI');
  assert.equal(messages[1].text.includes('provider private diagnostics'), false);
  assert.equal(
    (await db.chatConversation.findUniqueOrThrow({ where: { id: failed.id } })).aiPaused,
    true,
  );
});

test(
  'disabling AI while a reply is pending suppresses the answer',
  { timeout: 15000 },
  async () => {
    const c = await conversation();
    const held = heldReply();
    const work = replyToVisitor(c.id, c.messageId, request, held.client);
    await held.entered;
    await setting('chatAiEnabled', 'false');
    held.release();
    await work;
    assert.equal((await aiMessages(c.id)).length, 0);
    await setting('chatAiEnabled', 'true');
  },
);

test('abandoned claims recover once to human handoff without another paid request', async () => {
  const c = await conversation();
  await db.chatConversation.update({
    where: { id: c.id },
    data: { aiLastProcessedId: c.messageId, aiClaimedAt: new Date(Date.now() - 60000) },
  });
  let calls = 0;
  const client: typeof requestAssistantReply = async () => {
    calls++;
    return { text: 'This must not be sent.', handoff: false };
  };
  await Promise.all([
    replyToVisitor(c.id, c.messageId, request, client),
    replyToVisitor(c.id, c.messageId, request, client),
  ]);
  await replyToVisitor(c.id, c.messageId, request, client);
  assert.equal(calls, 0);
  const replies = await aiMessages(c.id);
  assert.equal(replies.length, 1);
  assert.match(replies[0].text, /studio team/);
  const stored = await db.chatConversation.findUniqueOrThrow({ where: { id: c.id } });
  assert.equal(stored.aiPaused, true);
  assert.equal(stored.aiClaimedAt, null);
  assert.equal(stored.messageCount, 2);
  assert.ok(stored.aiVersion >= 1);
});

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { db } from '../../src/lib/db';
import { CHAT_MESSAGE_LIMIT, CHAT_PRESENCE_MS } from '../../src/lib/chat-contract';

const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if (
  !process.env.DATABASE_URL?.includes('127.0.0.1') ||
  !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
)
  throw new Error('Chat tests require an isolated local app and disposable database.');
const suffix = randomUUID();
const email = `chat-${suffix}@example.test`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
let adminId = '',
  adminCookie = '',
  visitorCookie = '',
  otherCookie = '',
  conversationId = '';
let oldSetting: string | undefined;
async function request(path: string, method = 'GET', body?: unknown, cookie = '') {
  return fetch(origin + path, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
}
async function json(response: Response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
const first = () => ({
  name: 'Chat QA',
  email,
  consent: true,
  website: '',
  text: 'Can you print a custom planter?',
  clientId: randomUUID(),
});
before(async () => {
  oldSetting = (await db.storeSetting.findUnique({ where: { key: 'chatEnabled' } }))?.value;
  await db.storeSetting.upsert({
    where: { key: 'chatEnabled' },
    create: { key: 'chatEnabled', value: 'true' },
    update: { value: 'true' },
  });
  const user = await db.user.create({
    data: { email, name: 'Chat QA admin', role: 'ADMIN', passwordHash: 'unusable-test-password' },
  });
  adminId = user.id;
  const token = randomBytes(32).toString('hex');
  await db.session.create({
    data: { userId: adminId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000) },
  });
  adminCookie = `gx-session=${token}`;
});
after(async () => {
  await db.chatConversation.deleteMany({ where: { email } });
  await db.user.deleteMany({ where: { id: adminId } });
  if (oldSetting === undefined) await db.storeSetting.deleteMany({ where: { key: 'chatEnabled' } });
  else await db.storeSetting.update({ where: { key: 'chatEnabled' }, data: { value: oldSetting } });
  await db.$disconnect();
});

test('chat endpoints require administrator access and same-origin writes', async () => {
  for (const method of ['GET', 'POST', 'PATCH']) {
    await json(await request('/api/admin/chat', method, method === 'GET' ? undefined : {}), 401);
    await json(
      await request('/api/admin/chat/nope', method, method === 'GET' ? undefined : {}),
      401,
    );
  }
  assert.equal((await request('/admin/chat')).status, 307);
  await db.user.update({ where: { id: adminId }, data: { role: 'CUSTOMER' } });
  await json(await request('/api/admin/chat', 'GET', undefined, adminCookie), 403);
  await db.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
  await json(await request('/api/chat', 'POST', first()), 401);
  const crossOrigin = await fetch(origin + '/api/chat', {
    method: 'POST',
    headers: { Origin: 'https://other.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'initialize' }),
  });
  await json(crossOrigin, 403);
});

test('visitor sessions are private, scoped and only store hashed tokens', async () => {
  for (let i = 0; i < 2; i++) {
    const response = await request('/api/chat', 'POST', { action: 'initialize' });
    await json(response);
    const cookie = response.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=strict/i);
    assert.match(cookie, /Path=\/api\/chat/i);
    if (i) otherCookie = cookie.split(';')[0];
    else visitorCookie = cookie.split(';')[0];
  }
  await json(
    await request('/api/chat', 'POST', { ...first(), consent: false }, visitorCookie),
    400,
  );
  await json(
    await request('/api/chat', 'POST', { ...first(), website: 'spam.test' }, visitorCookie),
    400,
  );
  const started = await json(
    await request('/api/chat', 'POST', { ...first(), sender: 'ADMIN' }, visitorCookie),
  );
  assert.equal(started.message.sender, 'VISITOR');
  const response = await request('/api/chat', 'GET', undefined, visitorCookie);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const data = await json(response);
  conversationId = data.conversation.id;
  assert.equal(data.messages.length, 1);
  assert.equal(data.conversation.visitorTokenHash, undefined);
  assert.equal(data.messages[0].clientId, undefined);
  const stored = await db.chatConversation.findUniqueOrThrow({ where: { id: conversationId } });
  assert.equal(stored.visitorTokenHash, hash(visitorCookie.split('=')[1]));
  for (const cookie of ['', otherCookie]) {
    const own = await json(
      await request(`/api/chat?conversationId=${conversationId}`, 'GET', undefined, cookie),
    );
    assert.equal(own.conversation, null);
    assert.deepEqual(own.messages, []);
  }
  await json(
    await request('/api/chat', 'PATCH', { through: started.message.id }, otherCookie),
    401,
  );
});

test('concurrent retries create exactly one first message and conversation', async () => {
  const payload = first();
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      request('/api/chat', 'POST', payload, otherCookie).then((r) => json(r)),
    ),
  );
  assert.equal(new Set(responses.map((r) => r.message.id)).size, 1);
  const data = await json(await request('/api/chat', 'GET', undefined, otherCookie));
  assert.equal(data.conversation.messageCount, 1);
});

test('admin replies persist and read markers cannot hide newer unread messages', async () => {
  const payload = { text: '<script>alert("literal text")</script>', clientId: randomUUID() };
  const firstReply = await json(
    await request(`/api/admin/chat/${conversationId}`, 'POST', payload, adminCookie),
  );
  const retry = await json(
    await request(`/api/admin/chat/${conversationId}`, 'POST', payload, adminCookie),
  );
  assert.equal(retry.message.id, firstReply.message.id);
  const secondReply = await json(
    await request(
      `/api/admin/chat/${conversationId}`,
      'POST',
      { text: 'Yes, we can help.', clientId: randomUUID() },
      adminCookie,
    ),
  );
  await json(
    await request('/api/chat', 'PATCH', { through: firstReply.message.id }, visitorCookie),
  );
  let data = await json(await request('/api/chat', 'GET', undefined, visitorCookie));
  assert.equal(data.conversation.visitorReadThrough, firstReply.message.id);
  assert.equal(data.conversation.lastAdminMessageId, secondReply.message.id);
  assert.ok(data.messages.some((m: { text: string }) => m.text === payload.text));
  await json(await request('/api/chat', 'PATCH', { through: 0 }, visitorCookie));
  data = await json(await request('/api/chat', 'GET', undefined, visitorCookie));
  assert.equal(data.conversation.visitorReadThrough, firstReply.message.id);
  const inbox = await json(await request('/api/admin/chat', 'GET', undefined, adminCookie));
  assert.ok(inbox.conversations.some((c: { id: string }) => c.id === conversationId));
});

test('new customer messages reopen resolved chats and stale resolves are rejected', async () => {
  const data = await json(await request('/api/chat', 'GET', undefined, visitorCookie));
  const close = {
    status: 'CLOSED',
    expectedLastVisitorMessageId: data.conversation.lastVisitorMessageId,
  };
  await json(await request(`/api/admin/chat/${conversationId}`, 'PATCH', close, adminCookie));
  await json(
    await request(
      '/api/chat',
      'POST',
      { text: 'One more question.', clientId: randomUUID() },
      visitorCookie,
    ),
  );
  await json(await request(`/api/admin/chat/${conversationId}`, 'PATCH', close, adminCookie), 409);
  assert.equal(
    (await json(await request('/api/chat', 'GET', undefined, visitorCookie))).conversation.status,
    'OPEN',
  );
});

test('online presence expires and the storefront can be disabled', async () => {
  await json(await request('/api/admin/chat', 'POST', { available: true }, adminCookie));
  assert.equal((await json(await request('/api/chat'))).online, true);
  await db.chatPresence.update({
    where: { userId: adminId },
    data: { lastSeenAt: new Date(Date.now() - CHAT_PRESENCE_MS - 1000) },
  });
  assert.equal((await json(await request('/api/chat'))).online, false);
  await json(await request('/api/admin/chat', 'PATCH', { enabled: false }, adminCookie));
  await json(
    await request('/api/chat', 'POST', { text: 'Blocked', clientId: randomUUID() }, visitorCookie),
    503,
  );
  const home = await (await request('/')).text();
  assert.equal(home.includes('class="chat-launcher"'), false);
  await json(await request('/api/admin/chat', 'PATCH', { enabled: true }, adminCookie));
});

test('message history is paginated and cursors remain scoped to a conversation', async () => {
  await db.chatMessage.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({
      conversationId,
      sender: 'VISITOR' as const,
      text: `History ${i}`,
      clientId: randomUUID(),
    })),
  });
  const recent = await json(await request('/api/chat', 'GET', undefined, visitorCookie));
  assert.equal(recent.messages.length, 50);
  assert.equal(recent.hasMore, true);
  const older = await json(
    await request(`/api/chat?before=${recent.messages[0].id}`, 'GET', undefined, visitorCookie),
  );
  assert.ok(older.messages.length > 0);
  assert.equal(older.hasMore, false);
  assert.ok(older.messages.at(-1).id < recent.messages[0].id);
  const newer = await json(
    await request(`/api/chat?after=${older.messages.at(-1).id}`, 'GET', undefined, visitorCookie),
  );
  assert.deepEqual(
    newer.messages.map((m: { id: number }) => m.id),
    recent.messages.map((m: { id: number }) => m.id),
  );
  await json(await request('/api/chat?after=1&before=100', 'GET', undefined, visitorCookie), 400);
});

test('message limits and expired sessions are enforced server-side', async () => {
  await db.chatConversation.update({
    where: { id: conversationId },
    data: { messageCount: CHAT_MESSAGE_LIMIT - 1 },
  });
  const finalMessages = await Promise.all(
    [0, 1].map((i) =>
      request(
        '/api/chat',
        'POST',
        { text: `Last available message ${i}`, clientId: randomUUID() },
        visitorCookie,
      ),
    ),
  );
  assert.deepEqual(finalMessages.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await db.chatConversation.findUniqueOrThrow({ where: { id: conversationId } })).messageCount,
    CHAT_MESSAGE_LIMIT,
  );
  await json(
    await request(
      '/api/chat',
      'POST',
      { text: 'Full conversation', clientId: randomUUID() },
      visitorCookie,
    ),
    409,
  );
  await db.chatConversation.update({
    where: { id: conversationId },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (await json(await request('/api/chat', 'GET', undefined, visitorCookie))).conversation,
    null,
  );
  await json(
    await request(`/api/admin/chat/${conversationId}`, 'GET', undefined, adminCookie),
    404,
  );
  const response = await request('/api/chat', 'POST', { action: 'initialize' }, visitorCookie);
  await json(response);
  assert.notEqual(response.headers.get('set-cookie')!.split(';')[0], visitorCookie);
});

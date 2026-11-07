import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { db } from '../../src/lib/db';
import { shiftDay, studioDay } from '../../src/lib/time';

const database = new URL(process.env.DATABASE_URL || 'http://invalid');
const base = new URL(process.env.TEST_BASE_URL || 'http://invalid');
if (
  !['localhost', '127.0.0.1'].includes(base.hostname) ||
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  !/test|preview/.test(database.pathname)
)
  throw Error('Event orders require a local test app and database.');
const key = randomUUID(),
  email = 'event-' + key + '@example.test',
  eventDate = shiftDay(studioDay(), 20),
  ready = shiftDay(studioDay(), 12);
let productId = '';
let adminCookie = '',
  adminId = '',
  id = '',
  token = '',
  sample: File;
function url(path: string) {
  return new URL(path, base);
}
function post(path: string, body: FormData | string, admin = false) {
  return fetch(url(path), {
    method: 'POST',
    headers: {
      Origin: base.origin,
      ...(admin ? { Cookie: adminCookie } : {}),
      ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  });
}
async function json(res: Response, status: number) {
  const body = await res.text();
  assert.equal(res.status, status, body.slice(0, 500));
  return JSON.parse(body);
}
before(async () => {
  const auth = randomBytes(32).toString('hex');
  const user = await db.user.create({
    data: {
      email: 'admin-' + email,
      name: 'Event QA',
      passwordHash: 'unusable',
      role: 'ADMIN',
      sessions: {
        create: {
          tokenHash: createHash('sha256').update(auth).digest('hex'),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      },
    },
  });
  adminId = user.id;
  productId = (
    await db.product.create({
      data: {
        name: 'QA Event reference',
        slug: 'event-qa-' + key,
        sku: 'EVENT-TEST-' + key,
        shortDescription: 'QA',
        description: 'QA',
        price: 160,
        published: true,
        trackInventory: true,
        stock: 1,
      },
    })
  ).id;
  adminCookie = 'gx-session=' + auth;
  sample = new File(
    [
      new Uint8Array(
        await sharp(randomBytes(380 * 380 * 3), { raw: { width: 380, height: 380, channels: 3 } })
          .png()
          .toBuffer(),
      ),
    ],
    'proof.png',
    { type: 'image/png' },
  );
});
after(async () => {
  await db.eventOrderRequest.deleteMany({ where: { email } });
  await db.order.deleteMany({ where: { email } });
  await db.customer.deleteMany({ where: { email } });
  if (adminId) await db.user.deleteMany({ where: { id: adminId } });
  if (productId) await db.product.deleteMany({ where: { id: productId } });
  await db.$disconnect();
});
function requestForm() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    requestKey: key,
    name: 'Event Test',
    phone: '071111111',
    company: 'QA',
    email,
    productId,
    quantity: '40',
    eventDate,
    notes: 'Event favours for guests',
    consent: 'yes',
    website: '',
  }))
    f.set(k, v);
  f.set('namesFile', new File(['Ема\nСофија'], 'names.txt', { type: 'text/plain' }));
  f.set('logo', sample);
  return f;
}
function quoteForm(revision: number, price: string, includeSample = true) {
  const f = new FormData();
  f.set('revision', String(revision));
  f.set('unitPrice', price);
  f.set('readyBy', ready);
  f.set('quoteNotes', 'Rounded lettering');
  if (includeSample) f.set('sample', sample);
  return f;
}
const address = { street: 'Test 2', city: 'Скопје', postalCode: '1000', consent: true };
test('private request stores validated files and duplicate submissions produce the same private link', async () => {
  const bad = requestForm();
  bad.set('logo', new File(['<script>bad</script>'], 'spoof.png', { type: 'image/png' }));
  await json(await post('/api/event-orders', bad), 400);
  const a = await json(await post('/api/event-orders', requestForm()), 201);
  const b = await json(await post('/api/event-orders', requestForm()), 201);
  assert.equal(a.url, b.url);
  [, , id, token] = a.url.split('/');
  const chunks = await db.eventOrderAsset.count({
    where: { requestId: id, kind: { startsWith: 'src-' } },
  });
  assert.ok(chunks > 1);
  assert.equal((await fetch(url('/api/admin/event-orders/' + id + '/original-logo'))).status, 401);
  const stored = await db.eventOrderRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(stored.names, 'Ема\nСофија');
  const denied = await fetch(url('/api/admin/event-orders/' + id + '/logo'));
  assert.equal(denied.status, 401);
  const asset = await fetch(url('/api/admin/event-orders/' + id + '/logo'), {
    headers: { Cookie: adminCookie },
  });
  assert.equal(asset.headers.get('content-type'), 'image/webp');
  assert.equal(asset.headers.get('cache-control'), 'private, no-store');
  assert.equal((await sharp(Buffer.from(await asset.arrayBuffer())).metadata()).format, 'webp');
  const original = await fetch(url('/api/admin/event-orders/' + id + '/original-logo'), {
    headers: { Cookie: adminCookie },
  });
  assert.equal(original.status, 200);
  assert.deepEqual(
    Buffer.from(await original.arrayBuffer()),
    Buffer.from(await sample.arrayBuffer()),
  );
  const privatePage = await fetch(url(a.url));
  assert.equal(privatePage.status, 200);
  const html = await privatePage.text();
  assert.ok(!html.includes('071111111'));
  assert.ok(!html.includes(email));
});
test('admin publishes a versioned sample; guests and stale sample versions cannot access or approve it', async () => {
  const route = '/api/admin/event-orders/' + id + '/quote';
  await json(await post(route, quoteForm(0, '100')), 401);
  await json(await post(route, quoteForm(0, '100', false), true), 400);
  await json(await post(route, quoteForm(0, '100'), true), 200);
  await json(await post(route, quoteForm(0, '110'), true), 409);
  await json(await post(route, quoteForm(1, '110', false), true), 200);
  const api = '/api/event-orders/' + id + '/' + token;
  assert.equal((await fetch(url(api + '/sample?v=1'))).status, 404);
  assert.equal((await fetch(url(api + '/sample?v=2'))).status, 200);
  assert.equal(
    (await fetch(url('/api/event-orders/' + id + '/' + 'a'.repeat(64) + '/sample?v=2'))).status,
    404,
  );
  await json(await post(api + '/approve', JSON.stringify({ ...address, revision: 1 })), 409);
  const chunks = await db.eventOrderAsset.count({
    where: { requestId: id, kind: { startsWith: 'src-' } },
  });
  assert.ok(chunks > 1);
  assert.equal((await fetch(url('/api/admin/event-orders/' + id + '/original-logo'))).status, 401);
  const stored = await db.eventOrderRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(stored.orderId, null);
  assert.equal(stored.shipping, 0);
});
test('simultaneous approvals convert the quote into exactly one unpaid commerce order and confirmation', async () => {
  const path = '/api/event-orders/' + id + '/' + token + '/approve';
  const results = await Promise.all([
    post(path, JSON.stringify({ ...address, revision: 2 })),
    post(path, JSON.stringify({ ...address, revision: 2 })),
  ]);
  const cookie = results[0].headers.get('set-cookie')!.split(';')[0];
  const [a, b] = await Promise.all(results.map((res) => json(res, 200)));
  assert.equal(a.number, b.number);
  const setCookie = results[0].headers.get('set-cookie')!;
  assert.ok(setCookie.includes('Path=/order-confirmation/' + a.number));
  assert.ok(setCookie.includes('Max-Age=604800'));
  const order = await db.order.findUniqueOrThrow({
    where: { number: a.number },
    include: { items: true, eventRequest: true },
  });
  assert.equal(order.eventRequest?.id, id);
  assert.equal(order.status, 'CONFIRMED');
  assert.equal(order.paymentMethod, 'CASH_ON_DELIVERY');
  assert.equal(order.paidAt, null);
  assert.equal(order.items[0].quantity, 40);
  assert.equal(order.items[0].productId, productId);
  assert.equal(order.items[0].stockDeducted, false);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 1);
  for (const invalid of [
    { ...address, revision: 1 },
    { ...address, revision: 2, street: 'Different street' },
  ]) {
    const denied = await post(path, JSON.stringify(invalid));
    assert.equal(denied.headers.has('set-cookie'), false);
    await json(denied, 409);
  }
  assert.equal(order.total, 4400);
  assert.equal(order.source, 'ONLINE');
  assert.equal(await db.order.count({ where: { email } }), 1);
  assert.equal(
    (await fetch(url('/order-confirmation/' + a.number), { headers: { Cookie: cookie } })).status,
    200,
  );
  await json(
    await post('/api/admin/event-orders/' + id + '/quote', quoteForm(2, '130'), true),
    409,
  );
});

import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db } from '../../src/lib/db';

const database = new URL(process.env.DATABASE_URL || 'http://invalid');
const base = new URL(process.env.TEST_BASE_URL || 'http://invalid');
if (
  !['127.0.0.1', 'localhost'].includes(database.hostname) ||
  !/test|preview/.test(database.pathname) ||
  !['127.0.0.1', 'localhost'].includes(base.hostname)
) {
  throw new Error('Frame tests require an isolated local test database and app.');
}

const key = randomUUID();
const customer = 'frames-' + key + '@example.test';
let adminId: string | undefined;
let adminCookie = '';
let previousPrice: string | undefined;
let photo: Buffer;
let orderId = '';

async function setPrice(price: number) {
  const published = JSON.parse(previousPrice || '{}');
  const value = JSON.stringify({ ...published, '4x6': { matte: price } });
  await db.storeSetting.upsert({
    where: { key: 'framePrices' },
    create: { key: 'framePrices', value },
    update: { value },
  });
}
before(async () => {
  previousPrice = (await db.storeSetting.findUnique({ where: { key: 'framePrices' } }))?.value;
  await setPrice(810);
  const token = randomBytes(32).toString('hex');
  adminId = (
    await db.user.create({
      data: {
        name: 'Frame test admin',
        email: 'admin-' + customer,
        role: 'ADMIN',
        passwordHash: 'unusable',
        sessions: {
          create: {
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 3600000),
          },
        },
      },
    })
  ).id;
  adminCookie = 'gx-session=' + token;
  // Enough detail to require multiple DB packets and expose missing or misordered chunks.
  photo = await sharp(randomBytes(1200 * 1800 * 3), {
    raw: { width: 1200, height: 1800, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
});
after(async () => {
  await db.frameOrder.deleteMany({ where: { email: customer } });
  if (adminId) await db.user.deleteMany({ where: { id: adminId } });
  if (previousPrice === undefined)
    await db.storeSetting.deleteMany({ where: { key: 'framePrices' } });
  else
    await db.storeSetting.update({ where: { key: 'framePrices' }, data: { value: previousPrice } });
  await db.$disconnect();
});

function submit({
  idempotencyKey = key,
  expectedPrice = 810,
  file = photo,
  name = 'Frame tester',
  paper = 'matte',
}: {
  idempotencyKey?: string;
  expectedPrice?: number | null;
  file?: Buffer;
  name?: string;
  paper?: string;
} = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    idempotencyKey,
    expectedUnitPrice: expectedPrice === null ? '' : String(expectedPrice),
    name,
    email: customer,
    phone: '070123456',
    quantity: '2',
    paper,
    consent: 'true',
    notes: 'Endpoint check',
    design: JSON.stringify({
      size: '4x6',
      template: 'custom',
      names: '',
      date: '',
      caption: '',
      crops: [{ zoom: 1, panX: 0.5, panY: 0.5 }],
    }),
  }))
    form.set(key, value);
  form.append(
    'photos',
    new Blob([new Uint8Array(file)], { type: 'image/jpeg' }),
    'private-photo.jpg',
  );
  return fetch(new URL('/api/frame-orders', base), {
    method: 'POST',
    headers: { Origin: base.origin },
    body: form,
  });
}
const asset = (name: string, cookie = '') =>
  fetch(new URL('/api/admin/frame-orders/' + orderId + '/' + name, base), {
    headers: { Cookie: cookie },
  });
async function body(response: Response, status: number) {
  const json = await response.json();
  assert.equal(response.status, status, JSON.stringify(json));
  return json;
}

test('parallel retries persist one order and save the exact quoted paper, price and quantity', async () => {
  const responses = await Promise.all([submit(), submit()]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  const [a, b] = await Promise.all(responses.map((r) => r.json()));
  assert.equal(a.id, b.id);
  orderId = a.id;
  assert.equal(a.unitPrice, 810);
  assert.equal(a.quantity, 2);
  assert.match(a.reference, /^GX-F-/);
  assert.equal(await db.frameOrder.count({ where: { idempotencyKey: key } }), 1);
  const order = await db.frameOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, 'NEW');
  assert.equal(order.paper, 'matte');
  assert.ok((order.effectivePpi as number[])[0] >= 150);
});

test('both saved assets require admin access and match persisted bytes across chunk boundaries', async () => {
  for (const [path, kind] of [
    ['print', 'PRINT'],
    ['preview', 'PREVIEW'],
  ] as const) {
    await body(await asset(path), 401);
    const response = await asset(path, adminCookie);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.match(
      response.headers.get('content-type') || '',
      path === 'print' ? /application\/pdf/ : /image\/jpeg/,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, Number(response.headers.get('content-length')));
    const stored = await db.frameAssetChunk.findMany({
      where: { orderId, kind },
      orderBy: { position: 'asc' },
    });
    assert.deepEqual(bytes, Buffer.concat(stored.map((chunk) => chunk.data)));
    if (path === 'print') {
      assert.ok(stored.length > 1, 'Test artwork must span multiple chunks');
      assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
      assert.match(response.headers.get('content-disposition') || '', /attachment/);
    } else assert.equal((await sharp(bytes).metadata()).format, 'jpeg');
  }
});

test('a changed price requires reconfirmation, while a saved order can be retried at its accepted price', async () => {
  await setPrice(950);
  const replay = await body(await submit(), 200);
  assert.equal(replay.id, orderId);
  assert.equal(replay.unitPrice, 810);
  const repriced = await body(await submit({ idempotencyKey: randomUUID() }), 409);
  assert.equal(repriced.code, 'FRAME_PRICE_CHANGED');
  assert.equal(repriced.unitPrice, 950);
  await body(await submit({ name: 'Different customer' }), 409);
});

test('a paper without a published price is submitted for a quote with its print proof', async () => {
  const quote = await body(
    await submit({ idempotencyKey: randomUUID(), expectedPrice: null, paper: 'glossy' }),
    201,
  );
  const saved = await db.frameOrder.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(saved.unitPrice, null);
  assert.equal(saved.paper, 'glossy');
  assert.ok(saved.pdfBytes > 0 && saved.previewBytes > 0);
});

test('invalid image data leaves neither a reservation nor an order', async () => {
  const invalid = randomUUID();
  await body(
    await submit({
      idempotencyKey: invalid,
      expectedPrice: 950,
      file: Buffer.from('invalid photo'),
    }),
    422,
  );
  assert.equal(await db.frameOrder.count({ where: { idempotencyKey: invalid } }), 0);
});

test('admin updates status with a checked previous state', async () => {
  const patch = (status: string, expectedStatus: string, cookie = '') =>
    fetch(new URL('/api/admin/frame-orders/' + orderId, base), {
      method: 'PATCH',
      headers: { Origin: base.origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, expectedStatus }),
    });
  await body(await patch('PRINTING', 'NEW'), 401);
  await body(await patch('PRINTING', 'NEW', adminCookie), 200);
  await body(await patch('REJECTED', 'NEW', adminCookie), 409);
  assert.equal(
    (await db.frameOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
    'PRINTING',
  );
});

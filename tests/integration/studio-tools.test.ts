import 'dotenv/config';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { db } from '../../src/lib/db';
import { productionJobs } from '../../src/lib/production';
import { studioDay } from '../../src/lib/time';
const base = new URL(process.env.TEST_BASE_URL || 'https://invalid');
const database = new URL(process.env.DATABASE_URL || 'https://invalid');
if (
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  !/test|preview/.test(database.pathname) ||
  !['localhost', '127.0.0.1'].includes(base.hostname)
)
  throw Error('Studio tests require an isolated local database and server.');
const tag = randomUUID(),
  ids = { admin: '', product: '', custom: '', frame: '', customer: '' };
let session = '';
const blank = { productionDue: null, productionStation: null, productionMaterial: null };
const due = studioDay();
async function update(url: string, data: unknown, method = 'PATCH', auth = true) {
  return fetch(new URL(url, base), {
    method,
    headers: {
      Origin: base.origin,
      'Content-Type': 'application/json',
      ...(auth ? { Cookie: session } : {}),
    },
    body: JSON.stringify(data),
  });
}
before(async () => {
  const t = randomBytes(32).toString('hex');
  session = 'gx-session=' + t;
  ids.admin = (
    await db.user.create({
      data: {
        name: 'Studio QA',
        role: 'ADMIN',
        passwordHash: 'unusable',
        email: tag + '@example.test',
        sessions: {
          create: {
            tokenHash: createHash('sha256').update(t).digest('hex'),
            expiresAt: new Date(Date.now() + 3600000),
          },
        },
      },
    })
  ).id;
  ids.product = (
    await db.product.create({
      data: {
        name: 'Studio ' + tag,
        slug: 'studio-' + tag,
        sku: tag,
        shortDescription: 'Sample',
        description: 'Sample',
        price: 765,
        published: true,
      },
    })
  ).id;
  ids.custom = (
    await db.customPrintRequest.create({
      data: {
        name: tag,
        email: tag + '@example.test',
        phone: '070000001',
        description: tag,
        quantity: 9,
        color: 'Ivory',
        material: 'PLA',
        status: 'APPROVED',
      },
    })
  ).id;
  ids.frame = (
    await db.frameOrder.create({
      data: {
        idempotencyKey: randomUUID(),
        fingerprint: tag.replaceAll('-', '').repeat(2),
        reference: 'T-' + tag.slice(0, 12),
        name: tag,
        email: tag + '@example.test',
        phone: '070000001',
        quantity: 2,
        paper: 'glossy',
        notes: '',
        design: {},
        effectivePpi: [],
        pdfBytes: 0,
        previewBytes: 0,
      },
    })
  ).id;
  ids.customer = (
    await db.customer.create({
      data: {
        firstName: 'QA',
        lastName: 'Studio',
        email: tag + '@example.test',
        phone: '070000001',
      },
    })
  ).id;
  for (const source of ['ONLINE', 'MANUAL'] as const)
    await db.order.create({
      data: {
        number: 'T-' + source + tag.slice(0, 8),
        accessTokenHash: 'z'.repeat(64),
        idempotencyKey: randomUUID(),
        source,
        customerId: ids.customer,
        firstName: tag,
        lastName: 'Test',
        email: tag + '@example.test',
        phone: '070000001',
        street: 'Test',
        city: 'Skopje',
        postalCode: '1000',
        subtotal: 765,
        shipping: 150,
        total: 915,
        shippingMethodId: 'standard',
        shippingName: 'Standard',
        items: {
          create: {
            name: 'Studio print',
            sku: tag,
            quantity: 1,
            unitPrice: 765,
            subtotal: 765,
            madeToOrder: true,
          },
        },
      },
    });
});
after(async () => {
  if (ids.customer) {
    await db.order.deleteMany({ where: { customerId: ids.customer } });
    await db.customer.deleteMany({ where: { id: ids.customer } });
  }
  if (ids.custom) await db.customPrintRequest.deleteMany({ where: { id: ids.custom } });
  if (ids.frame) await db.frameOrder.deleteMany({ where: { id: ids.frame } });
  if (ids.product) await db.product.deleteMany({ where: { id: ids.product } });
  if (ids.admin) await db.user.deleteMany({ where: { id: ids.admin } });
  await db.$disconnect();
});
test('gift tag choices change customer results, respect budget, and reject stale edits', async () => {
  const url = '/api/admin/gift-finder/' + ids.product;
  const next = { occasions: ['anniversary'], recipients: ['partner'] };
  assert.ok(
    [401, 403].includes((await update(url, { expected: null, next }, 'PUT', false)).status),
  );
  assert.equal((await update(url, { expected: null, next }, 'PUT')).status, 200);
  assert.equal((await update(url, { expected: null, next }, 'PUT')).status, 409);
  const results = async (budget: number) =>
    (
      await (
        await fetch(
          new URL('/gift-finder?occasion=anniversary&recipient=partner&budget=' + budget, base),
        )
      ).text()
    ).includes('/product/studio-' + tag);
  assert.equal(await results(1000), true);
  assert.equal(await results(500), false);
  assert.equal((await update(url, { expected: next, next: null }, 'PUT')).status, 200);
  assert.equal(await results(1000), false);
});
test('queue unifies open walk-ins, shop, frame and custom jobs; schedule persists and stale updates cannot overwrite it', async () => {
  const list = (await productionJobs()).filter((j) => j.customer.includes(tag));
  assert.deepEqual(
    new Set(list.map((j) => j.source)),
    new Set(['Shop', 'Walk-in', 'Frame', 'Custom print']),
  );
  assert.equal(list.find((j) => j.kind === 'frame')?.material, 'Glossy paper');
  const url = '/api/admin/production/custom/' + ids.custom;
  const plan = {
    productionDue: due,
    productionStation: 'printer',
    productionMaterial: 'Ivory PETG',
  };
  assert.ok(
    [401, 403].includes((await update(url, { expected: blank, plan }, 'PATCH', false)).status),
  );
  assert.equal((await update(url, { expected: blank, plan })).status, 200);
  assert.equal(
    (await update(url, { expected: blank, plan: { ...plan, productionMaterial: 'Other' } })).status,
    409,
  );
  const job = (await productionJobs()).find((j) => j.id === ids.custom)!;
  assert.equal(job.due, due);
  assert.equal(job.material, 'Ivory PETG');
  await db.customPrintRequest.update({ where: { id: ids.custom }, data: { status: 'COMPLETED' } });
  assert.ok(!(await productionJobs()).some((j) => j.id === ids.custom));
});

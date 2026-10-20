import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../../src/lib/db';
import { createManualOrder } from '../../src/lib/manual-orders';
import { createOrder, updateOrderStatus } from '../../src/lib/checkout';
import { confirmOrderPayment, recordOrderReturn } from '../../src/lib/rewards-admin';
import { paidRevenue } from '../../src/lib/revenue';
import { hash, secret } from '../../src/lib/security';
import { studioDay, shiftDay } from '../../src/lib/time';
import { visitIdentity } from '../../src/lib/visitor-rules';
import { pruneVisitors, recordVisitor, visitorReport } from '../../src/lib/visitors';

if (new URL(process.env.DATABASE_URL!).hostname !== '127.0.0.1')
  throw Error('Use a disposable local MySQL database for these tests.');
const origin = process.env.TEST_BASE_URL;
if (origin && new URL(origin).hostname !== '127.0.0.1')
  throw Error('HTTP tests must target the local preview.');
const tag = `manual-${randomUUID()}`;
const email = `${tag}@example.test`;
let adminId = '',
  customerId = '',
  productId = '',
  variantProductId = '',
  variantId = '',
  shippingId = '';
let adminCookie = '',
  customerCookie = '';
let savedTracking: string | undefined;
const hashes: string[] = [];
function input(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    date: studioDay(),
    status: 'DELIVERED',
    paid: true,
    paymentMethod: 'CASH',
    fulfillment: 'PICKUP',
    shipping: 0,
    adjustStock: true,
    email,
    items: [{ name: 'Custom sign', quantity: 2, unitPrice: 500 }],
    ...overrides,
  };
}
async function cookie(userId: string) {
  const token = randomBytes(32).toString('hex');
  await db.session.create({
    data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000) },
  });
  return `gx-session=${token}`;
}
async function http(
  path: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${origin}${path}`, {
    method,
    redirect: 'manual',
    headers: { Origin: origin!, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
before(async () => {
  adminId = (
    await db.user.create({ data: { name: tag, email, passwordHash: 'test-only', role: 'ADMIN' } })
  ).id;
  customerId = (
    await db.user.create({
      data: { name: tag, email: `customer-${email}`, passwordHash: 'test-only' },
    })
  ).id;
  adminCookie = await cookie(adminId);
  customerCookie = await cookie(customerId);
  const product = {
    name: tag,
    slug: tag,
    sku: tag,
    price: 500,
    shortDescription: 'QA',
    description: 'QA',
    published: true,
    inventoryMode: 'IN_STOCK' as const,
    trackInventory: true,
    stock: 100,
  };
  productId = (await db.product.create({ data: product })).id;
  const variantProduct = await db.product.create({
    data: {
      ...product,
      slug: `${tag}-v`,
      sku: `${tag}-v`,
      variants: { create: { name: 'Green', sku: `${tag}-green`, stock: 5 } },
    },
    include: { variants: true },
  });
  variantProductId = variantProduct.id;
  variantId = variantProduct.variants[0].id;
  shippingId = (await db.shippingMethod.create({ data: { name: tag, kind: 'PICKUP', price: 0 } }))
    .id;
  savedTracking = (await db.storeSetting.findUnique({ where: { key: 'analyticsEnabled' } }))?.value;
  await db.storeSetting.upsert({
    where: { key: 'analyticsEnabled' },
    create: { key: 'analyticsEnabled', value: 'true' },
    update: { value: 'true' },
  });
});
after(async () => {
  await db.order.deleteMany({ where: { OR: [{ enteredById: adminId }, { email }] } });
  await db.customer.deleteMany({ where: { email } });
  await db.product.deleteMany({
    where: { id: { in: [productId, variantProductId].filter(Boolean) } },
  });
  if (shippingId) await db.shippingMethod.delete({ where: { id: shippingId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, customerId].filter(Boolean) } } });
  await db.visitorDay.deleteMany({ where: { visitorHash: { in: hashes } } });
  if (savedTracking !== undefined)
    await db.storeSetting.update({
      where: { key: 'analyticsEnabled' },
      data: { value: savedTracking },
    });
  else await db.storeSetting.deleteMany({ where: { key: 'analyticsEnabled' } });
  await db.$disconnect();
});
test('concurrent retries create one paid manual sale, deduct stock once and record the agreed total', async () => {
  const baseline = await paidRevenue();
  const payload = input({
    items: [
      { productId, quantity: 2, unitPrice: 450 },
      { name: 'Custom sign', quantity: 1, unitPrice: 700 },
    ],
  });
  const orders = await Promise.all([
    createManualOrder(payload, adminId),
    createManualOrder(payload, adminId),
  ]);
  assert.equal(orders[0].id, orders[1].id);
  assert.equal(orders[0].total, 1600);
  assert.equal(orders[0].source, 'MANUAL');
  assert.equal(orders[0].rewardsUserId, null);
  assert.equal(orders[0].pointsEarned, 0);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 98);
  assert.equal((await paidRevenue()).today - baseline.today, 1600);
  await assert.rejects(
    createManualOrder({ ...payload, internalNotes: 'changed' }, adminId),
    /different order/,
  );
  await assert.rejects(createManualOrder(input(), customerId), /Administrator/);
});
test('unpaid, later payment and refunds change paid revenue once; backdated sales keep their date', async () => {
  const baseline = await paidRevenue();
  const order = await createManualOrder(
    input({
      paid: false,
      fulfillment: 'DELIVERY',
      shipping: 180,
      firstName: 'Test',
      phone: '+38970000000',
      street: 'Test 1',
      city: 'Skopje',
    }),
    adminId,
  );
  assert.equal((await paidRevenue()).today, baseline.today);
  await Promise.all([
    confirmOrderPayment(order.id, adminId),
    confirmOrderPayment(order.id, adminId),
  ]);
  assert.equal((await paidRevenue()).today - baseline.today, 1180);
  await recordOrderReturn(
    order.id,
    { refundedProducts: 500, giftReturned: false, reason: 'QA' },
    adminId,
  );
  await recordOrderReturn(
    order.id,
    { refundedProducts: 500, giftReturned: false, reason: 'QA retry' },
    adminId,
  );
  assert.equal((await paidRevenue()).today - baseline.today, 680);
  const backdated = await createManualOrder(input({ date: shiftDay(studioDay(), -40) }), adminId);
  assert.equal(studioDay(backdated.orderedAt), shiftDay(studioDay(), -40));
  const current = await paidRevenue();
  assert.equal(current.today - baseline.today, 680);
  assert.equal(current.month - baseline.month, 680);
  assert.equal(current.total - baseline.total, 1680);
});
test('repeated item lines and racing sales cannot oversell; cancellation restores only deducted stock', async () => {
  await db.product.update({ where: { id: productId }, data: { stock: 3 } });
  await assert.rejects(
    createManualOrder(
      input({
        items: [
          { productId, quantity: 2, unitPrice: 500 },
          { productId, quantity: 2, unitPrice: 500 },
        ],
      }),
      adminId,
    ),
    /insufficient stock/,
  );
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 3);
  const pending = () =>
    input({ status: 'NEW', paid: false, items: [{ productId, quantity: 2, unitPrice: 500 }] });
  const results = await Promise.allSettled([
    createManualOrder(pending(), adminId),
    createManualOrder(pending(), adminId),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const success = results.find((r) => r.status === 'fulfilled')!;
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 1);
  await updateOrderStatus(success.value.id, 'CANCELLED', 'QA');
  await updateOrderStatus(success.value.id, 'CANCELLED', 'QA retry');
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 3);
  const historic = await createManualOrder({ ...pending(), adjustStock: false }, adminId);
  await updateOrderStatus(historic.id, 'CANCELLED', 'QA historical');
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 3);
});
test('variants are validated, variant stock changes, and online checkout remains compatible', async () => {
  await assert.rejects(
    createManualOrder(
      input({ items: [{ productId: variantProductId, quantity: 1, unitPrice: 500 }] }),
      adminId,
    ),
    /variant/,
  );
  await assert.rejects(
    createManualOrder(
      input({ items: [{ productId, variantId, quantity: 1, unitPrice: 500 }] }),
      adminId,
    ),
    /variant/,
  );
  await createManualOrder(
    input({ items: [{ productId: variantProductId, variantId, quantity: 2, unitPrice: 600 }] }),
    adminId,
  );
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 3);
  const { order } = await createOrder({
    items: [{ productId, quantity: 1, options: {} }],
    shippingMethodId: shippingId,
    firstName: 'QA',
    lastName: 'Online',
    email,
    phone: '+38970000000',
    street: 'Test 1',
    city: 'Skopje',
    postalCode: '1000',
    country: 'MK',
    acceptTerms: true,
    idempotencyKey: randomUUID(),
  });
  assert.equal(order.source, 'ONLINE');
  assert.equal(order.enteredById, null);
  assert.equal(studioDay(order.orderedAt), studioDay());
  assert.equal(order.paidAt, null);
  await updateOrderStatus(order.id, 'CANCELLED', 'QA cleanup');
});
test('repeat visitors upsert atomically, cities group correctly and expired data is pruned', async () => {
  const now = new Date();
  const headers = new Headers({
    'x-forwarded-for': '5.32.177.1',
    'user-agent': `Mozilla/5.0 ${tag}`,
  });
  const identity = visitIdentity(headers, secret(), now)!;
  hashes.push(identity.visitorHash);
  const before = await visitorReport(identity.day);
  await Promise.all([recordVisitor(identity, now), recordVisitor(identity, now)]);
  const after = await visitorReport(identity.day);
  assert.equal(after.total - before.total, 1);
  assert.equal(after.macedonia - before.macedonia, 1);
  const record = await db.visitorDay.findUniqueOrThrow({
    where: { day_visitorHash: { day: identity.day, visitorHash: identity.visitorHash } },
  });
  assert.equal(record.city, 'Skopje');
  assert.equal('ip' in record, false);
  assert.equal('userAgent' in record, false);
  const oldHash = hash(`${tag}-expired`);
  hashes.push(oldHash);
  await db.visitorDay.create({
    data: { day: shiftDay(studioDay(now), -35), visitorHash: oldHash },
  });
  await pruneVisitors(new Date(now.getTime() + 3600001));
  assert.equal(await db.visitorDay.count({ where: { visitorHash: oldHash } }), 0);
});
test(
  'HTTP admin APIs require role and same origin; analytics respects pause, admin sessions and privacy',
  { skip: !origin },
  async () => {
    assert.equal((await http('/api/admin/orders', 'POST', input())).status, 401);
    assert.equal(
      (await http('/api/admin/orders', 'POST', input(), { Cookie: customerCookie })).status,
      403,
    );
    assert.equal(
      (
        await http('/api/admin/orders', 'POST', input(), {
          Cookie: adminCookie,
          Origin: 'https://evil.test',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await http('/api/admin/orders', 'POST', input({ paid: true, status: 'NEW' }), {
          Cookie: adminCookie,
        })
      ).status,
      400,
    );
    const saved = await http('/api/admin/orders', 'POST', input(), { Cookie: adminCookie });
    assert.equal(saved.status, 200, await saved.clone().text());
    const result = await saved.json();
    for (const path of ['/admin/analytics', '/admin/orders/new', `/admin/orders/${result.id}`]) {
      const page = await http(path, 'GET', undefined, { Cookie: adminCookie });
      assert.equal(page.status, 200, path);
      assert.equal((await page.text()).includes('NEXT_HTTP_ERROR_FALLBACK;500'), false, path);
      assert.ok([307, 308].includes((await http(path, 'GET', undefined)).status));
    }
    const h = { 'x-forwarded-for': '5.32.177.1', 'user-agent': `Mozilla/5.0 ${tag}-http` };
    const identity = visitIdentity(new Headers(h), secret())!;
    hashes.push(identity.visitorHash);
    const count = () => db.visitorDay.count({ where: { visitorHash: identity.visitorHash } });
    const excludedHeaders: Record<string, string>[] = [
      { Cookie: adminCookie },
      { DNT: '1' },
      { 'Sec-GPC': '1' },
      { Origin: 'https://evil.test' },
    ];
    for (const extra of excludedHeaders) {
      await http('/api/visits', 'POST', {}, { ...h, ...extra });
      assert.equal(await count(), 0);
    }
    assert.equal(
      (await http('/api/admin/analytics/settings', 'PUT', { enabled: false })).status,
      401,
    );
    assert.equal(
      (
        await http(
          '/api/admin/analytics/settings',
          'PUT',
          { enabled: false },
          { Cookie: adminCookie },
        )
      ).status,
      200,
    );
    await http('/api/visits', 'POST', {}, h);
    assert.equal(await count(), 0);
    await http('/api/admin/analytics/settings', 'PUT', { enabled: true }, { Cookie: adminCookie });
    await Promise.all([http('/api/visits', 'POST', {}, h), http('/api/visits', 'POST', {}, h)]);
    assert.equal(await count(), 1);
  },
);

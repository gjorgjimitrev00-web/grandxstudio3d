import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { db } from '../../src/lib/db';
import { createOrder, updateOrderStatus, quoteCart, serializable } from '../../src/lib/checkout';
import { confirmOrderPayment, recordOrderReturn } from '../../src/lib/rewards-admin';
import { postPoints, rewardsSummary } from '../../src/lib/rewards';
import { defaultRewardsSettings } from '../../src/lib/rewards-rules';
import { rateLimit } from '../../src/lib/security';

if (
  !process.env.DATABASE_URL?.includes('127.0.0.1') &&
  process.env.TEST_DATABASE_CONFIRMED !== 'true'
)
  throw Error('Rewards tests require an explicitly confirmed disposable database.');
const tag = `rewards-${randomUUID()}`;
const users: string[] = [];
let productId: string, giftProductId: string, giftId: string, shippingId: string;
let savedSettings: string | undefined;
async function customer(points = 1000) {
  const user = await db.user.create({
    data: { name: 'Rewards QA', email: `${randomUUID()}@example.test`, passwordHash: 'test-only' },
  });
  users.push(user.id);
  if (points)
    await serializable((tx) =>
      postPoints(tx, {
        userId: user.id,
        points,
        eventKey: `test:${user.id}`,
        kind: 'ADMIN_ADJUSTMENT',
        note: 'Test opening balance',
      }),
    );
  return user.id;
}
function checkout(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ productId, quantity: 3, options: {} }],
    shippingMethodId: shippingId,
    firstName: 'Rewards',
    lastName: 'QA',
    email: `${tag}@example.test`,
    phone: '+38970000000',
    street: 'Test 1',
    city: 'Skopje',
    postalCode: '1000',
    country: 'MK',
    acceptTerms: true,
    idempotencyKey: randomUUID(),
    rewards: { discountPoints: 300, giftId },
    ...overrides,
  };
}
async function deliver(id: string) {
  for (const status of ['CONFIRMED', 'READY', 'SHIPPED', 'DELIVERED'] as const)
    await updateOrderStatus(id, status, 'QA');
}
async function balance(userId: string) {
  return (await db.rewardsAccount.findUnique({ where: { userId } }))?.balance || 0;
}
before(async () => {
  savedSettings = (await db.storeSetting.findUnique({ where: { key: 'rewards' } }))?.value;
  await db.storeSetting.upsert({
    where: { key: 'rewards' },
    create: { key: 'rewards', value: JSON.stringify(defaultRewardsSettings) },
    update: { value: JSON.stringify(defaultRewardsSettings) },
  });
  const product = await db.product.create({
    data: {
      name: tag,
      slug: tag,
      sku: tag,
      shortDescription: 'QA',
      description: 'QA',
      price: 1000,
      published: true,
      trackInventory: true,
      stock: 100,
    },
  });
  productId = product.id;
  const gift = await db.product.create({
    data: {
      name: `${tag}-gift`,
      slug: `${tag}-gift`,
      sku: `${tag}-gift`,
      shortDescription: 'QA',
      description: 'QA',
      price: 500,
      published: true,
      trackInventory: true,
      stock: 20,
    },
  });
  giftProductId = gift.id;
  giftId = (await db.rewardGift.create({ data: { productId: gift.id, points: 250 } })).id;
  shippingId = (
    await db.shippingMethod.create({
      data: { name: tag, kind: 'STANDARD', price: 180, freeThreshold: 3000 },
    })
  ).id;
});
after(async () => {
  await db.order.deleteMany({ where: { email: `${tag}@example.test` } });
  await db.customer.deleteMany({ where: { email: `${tag}@example.test` } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.product.deleteMany({
    where: { id: { in: [productId, giftProductId].filter(Boolean) } },
  });
  if (shippingId) await db.shippingMethod.delete({ where: { id: shippingId } });
  if (savedSettings !== undefined)
    await db.storeSetting.update({ where: { key: 'rewards' }, data: { value: savedSettings } });
  else await db.storeSetting.deleteMany({ where: { key: 'rewards' } });
  await db.$disconnect();
});

test('discount + gift preserve free shipping, debit once, earn only after delivered and paid, and settle partial/full returns', async () => {
  const userId = await customer();
  const input = checkout();
  const { order } = await createOrder(input, userId);
  assert.equal(order.subtotal, 3000);
  assert.equal(order.shipping, 0);
  assert.equal(order.total, 2700);
  assert.equal(order.pointsEarned, 135);
  assert.equal(await balance(userId), 450);
  const lines = await db.orderItem.findMany({ where: { orderId: order.id } });
  assert.equal(lines.find((i) => i.rewardGift)?.subtotal, 0);
  assert.equal((await createOrder(input, userId)).order.id, order.id);
  assert.equal(await balance(userId), 450);
  assert.equal((await rewardsSummary(userId)).pending, 135);
  await assert.rejects(confirmOrderPayment(order.id, userId), /delivery/);
  await deliver(order.id);
  assert.equal(await balance(userId), 450);
  await Promise.all([confirmOrderPayment(order.id, userId), confirmOrderPayment(order.id, userId)]);
  assert.equal(await balance(userId), 585);
  assert.equal((await rewardsSummary(userId)).pending, 0);
  await recordOrderReturn(
    order.id,
    { refundedProducts: 1350, giftReturned: false, reason: 'Partial return' },
    userId,
  );
  assert.equal(await balance(userId), 667);
  await recordOrderReturn(
    order.id,
    { refundedProducts: 1350, giftReturned: false, reason: 'Retry' },
    userId,
  );
  assert.equal(await balance(userId), 667);
  await assert.rejects(
    recordOrderReturn(
      order.id,
      { refundedProducts: 100, giftReturned: false, reason: 'Bad' },
      userId,
    ),
    /cannot decrease/,
  );
  await recordOrderReturn(
    order.id,
    { refundedProducts: 2700, giftReturned: true, reason: 'Full return including gift' },
    userId,
  );
  assert.equal(await balance(userId), 1000);
});

test('cancellation restores gift stock and points once, even if rewards were paused', async () => {
  const userId = await customer();
  const beforeStock = (await db.product.findUniqueOrThrow({ where: { id: giftProductId } })).stock;
  const { order } = await createOrder(checkout(), userId);
  await db.storeSetting.update({
    where: { key: 'rewards' },
    data: { value: JSON.stringify({ ...defaultRewardsSettings, enabled: false }) },
  });
  await updateOrderStatus(order.id, 'CANCELLED', 'QA');
  await updateOrderStatus(order.id, 'CANCELLED', 'QA retry');
  assert.equal(await balance(userId), 1000);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: giftProductId } })).stock,
    beforeStock,
  );
  assert.equal((await rewardsSummary(userId)).pending, 0);
  await assert.rejects(createOrder(checkout(), userId), /paused/);
  await db.storeSetting.update({
    where: { key: 'rewards' },
    data: { value: JSON.stringify(defaultRewardsSettings) },
  });
});

test('concurrent orders cannot spend the same balance, and concurrent retries create one order', async () => {
  const userId = await customer(200);
  const make = () => checkout({ rewards: { discountPoints: 200, giftId: '' } });
  const results = await Promise.allSettled([
    createOrder(make(), userId),
    createOrder(make(), userId),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await balance(userId), 0);
  const second = await customer(200);
  const input = make();
  const [a, b] = await Promise.all([createOrder(input, second), createOrder(input, second)]);
  assert.equal(a.order.id, b.order.id);
  assert.equal(await balance(second), 0);
  await assert.rejects(createOrder(input, userId), /session changed/);
});

test('guest and invalid gift redemptions fail without spending points or reserving inventory', async () => {
  await assert.rejects(createOrder(checkout()), /Sign in/);
  const userId = await customer();
  await assert.rejects(
    createOrder(checkout({ rewards: { discountPoints: 700, giftId: '' } }), userId),
    /up to/,
  );
  await db.product.update({ where: { id: giftProductId }, data: { stock: 1 } });
  await assert.rejects(
    createOrder(
      checkout({
        items: [{ productId: giftProductId, quantity: 1, options: {} }],
        rewards: { discountPoints: 0, giftId },
      }),
      userId,
    ),
    /insufficient stock/,
  );
  assert.equal(await balance(userId), 1000);
  await db.product.update({ where: { id: giftProductId }, data: { stock: 20 } });
  const quote = await quoteCart(db, [{ productId, quantity: 2, options: {} }], shippingId, userId, {
    discountPoints: 0,
    giftId,
  });
  assert.equal(quote.subtotal, 2000);
  assert.equal(quote.shipping, 180);
  assert.equal(quote.pointsEarned, 100);
});

test('return after spending earned points creates a debt and old orders retain earning rules', async () => {
  const userId = await customer(0);
  const { order } = await createOrder(
    checkout({
      items: [{ productId, quantity: 4, options: {} }],
      rewards: { discountPoints: 0, giftId: '' },
    }),
    userId,
  );
  await db.storeSetting.update({
    where: { key: 'rewards' },
    data: { value: JSON.stringify({ ...defaultRewardsSettings, earnEveryMkd: 100 }) },
  });
  await deliver(order.id);
  await confirmOrderPayment(order.id, userId);
  assert.equal(await balance(userId), 200);
  await createOrder(checkout({ rewards: { discountPoints: 200, giftId: '' } }), userId);
  await recordOrderReturn(
    order.id,
    { refundedProducts: 4000, giftReturned: false, reason: 'Returned after redemption' },
    userId,
  );
  assert.equal(await balance(userId), -200);
  await assert.rejects(
    createOrder(checkout({ rewards: { discountPoints: 100, giftId: '' } }), userId),
    /up to/,
  );
  await db.storeSetting.update({
    where: { key: 'rewards' },
    data: { value: JSON.stringify(defaultRewardsSettings) },
  });
});

test(
  'HTTP checkout retries retain one order and cannot double-spend points',
  { skip: !process.env.TEST_BASE_URL },
  async () => {
    const origin = process.env.TEST_BASE_URL!;
    const userId = await customer(200);
    const token = randomUUID();
    await db.session.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const input = checkout({ rewards: { discountPoints: 200, giftId: '' } });
    const replies = await Promise.all(
      Array.from({ length: 3 }, async () => {
        const response = await fetch(origin + '/api/checkout', {
          method: 'POST',
          headers: {
            Origin: origin,
            Cookie: `gx-session=${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
        const body = await response.json();
        assert.equal(response.status, 200, JSON.stringify(body));
        return body.number;
      }),
    );
    assert.equal(new Set(replies).size, 1);
    assert.equal(await balance(userId), 0);
  },
);

test('simultaneous first requests count toward rate limits without duplicate-key failures', async () => {
  const scope = `qa-${randomUUID()}`;
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () => rateLimit(new Request('http://127.0.0.1/'), scope, 5, 900)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
  for (const result of results)
    if (result.status === 'rejected') assert.equal(result.reason.status, 429);
});

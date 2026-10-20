import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '../../src/lib/db';
import { quoteCart, createOrder } from '../../src/lib/checkout';
import { availableGifts } from '../../src/lib/rewards';
import {
  defaultBlackFriday,
  productPrice,
  withCampaign,
  type BlackFriday,
} from '../../src/lib/campaign-rules';
import { catalogPriceSql, campaignMatchSql } from '../../src/lib/campaigns';
import { storefrontProductSql, storefrontProductWhere } from '../../src/lib/catalog-visibility';

const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || !/preview|test/.test(url.pathname))
  throw Error('Campaign tests require a disposable local test/preview database.');
const tag = `campaign-qa-${randomUUID()}`;
let categoryId: string, otherCategoryId: string, productId: string, saleId: string, plainId: string;
let variantId: string, draftId: string, shippingId: string, userId: string, giftId: string;
let previousCampaign: string | undefined;
let config: BlackFriday;
const origin = process.env.TEST_BASE_URL;
const token = randomUUID();

async function save(c: BlackFriday) {
  const value = JSON.stringify(c);
  await db.storeSetting.upsert({
    where: { key: 'blackFriday' },
    create: { key: 'blackFriday', value },
    update: { value },
  });
}
const items = (id = productId) => [{ productId: id, quantity: 1, options: {} }];
const input = () => ({
  items: items(),
  shippingMethodId: shippingId,
  firstName: 'Campaign',
  lastName: 'QA',
  email: `${tag}@example.test`,
  phone: '+38970000000',
  city: 'Skopje',
  postalCode: '1000',
  street: 'Test 1',
  country: 'MK',
  acceptTerms: true,
  idempotencyKey: randomUUID(),
});
async function request(
  path: string,
  method = 'GET',
  data?: unknown,
  authenticated = false,
  crossOrigin = false,
) {
  return fetch(origin + path, {
    method,
    headers: {
      Origin: crossOrigin ? 'https://example.test' : origin!,
      'Content-Type': 'application/json',
      ...(authenticated ? { Cookie: `gx-session=${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: 'manual',
  });
}
before(async () => {
  previousCampaign = (await db.storeSetting.findUnique({ where: { key: 'blackFriday' } }))?.value;
  categoryId = (await db.category.create({ data: { name: tag, slug: tag, description: '' } })).id;
  otherCategoryId = (
    await db.category.create({
      data: { name: tag + '-other', slug: tag + '-other', description: '' },
    })
  ).id;
  async function product(
    suffix: string,
    price: number,
    salePrice: number | null,
    published = true,
    categorized = true,
  ) {
    return db.product.create({
      data: {
        name: tag + suffix,
        slug: tag + suffix,
        sku: tag + suffix,
        shortDescription: 'QA',
        description: 'QA',
        price,
        salePrice,
        published,
        trackInventory: true,
        stock: 10,
        ...(categorized
          ? { categories: { create: [{ categoryId }, { categoryId: otherCategoryId }] } }
          : {}),
      },
    });
  }
  productId = (await product('-product', 1000, 900)).id;
  saleId = (await product('-sale', 1000, 650)).id;
  plainId = (await product('-plain', 555, null, true, false)).id;
  draftId = (await product('-draft', 1000, null, false)).id;
  variantId = (
    await db.productVariant.create({
      data: {
        productId: saleId,
        name: 'Variant',
        sku: tag + '-variant',
        price: 1200,
        stock: 10,
      },
    })
  ).id;
  giftId = (await db.rewardGift.create({ data: { productId, points: 100, enabled: true } })).id;
  shippingId = (
    await db.shippingMethod.create({
      data: {
        name: tag,
        kind: 'STANDARD',
        price: 150,
        freeThreshold: 3000,
      },
    })
  ).id;
  userId = (
    await db.user.create({
      data: {
        name: 'Campaign QA',
        email: `${tag}-admin@example.test`,
        passwordHash: 'not-for-login',
        role: 'ADMIN',
        rewardsAccount: { create: { balance: 1000 } },
      },
    })
  ).id;
  await db.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  config = {
    ...defaultBlackFriday,
    enabled: true,
    startsOn: '2020-01-01',
    endsOn: '2099-12-31',
    categoryIds: [categoryId],
    productIds: [plainId],
  };
  await save(config);
});
after(async () => {
  await db.order.deleteMany({ where: { email: `${tag}@example.test` } });
  await db.customer.deleteMany({ where: { email: `${tag}@example.test` } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.product.deleteMany({
    where: { id: { in: [productId, saleId, plainId, draftId].filter(Boolean) } },
  });
  await db.category.deleteMany({
    where: { id: { in: [categoryId, otherCategoryId].filter(Boolean) } },
  });
  if (shippingId) await db.shippingMethod.delete({ where: { id: shippingId } });
  if (previousCampaign !== undefined)
    await db.storeSetting.upsert({
      where: { key: 'blackFriday' },
      create: { key: 'blackFriday', value: previousCampaign },
      update: { value: previousCampaign },
    });
  else await db.storeSetting.deleteMany({ where: { key: 'blackFriday' } });
  await db.$disconnect();
});

test('catalog SQL, cards and checkout agree on rounded promotional prices and variants', async () => {
  const effective = catalogPriceSql(config);
  const rows = await db.$queryRaw<{ id: string; effective: number }[]>(Prisma.sql`
    SELECT p.id, ${effective} AS effective FROM Product p
    WHERE ${storefrontProductSql} AND ${campaignMatchSql(config)} AND p.id IN (${Prisma.join([productId, saleId, plainId, draftId])})
    ORDER BY ${effective} ASC
  `);
  assert.deepEqual(
    rows.map((r) => r.id),
    [plainId, saleId, productId],
  );
  assert.deepEqual(
    rows.map((r) => Number(r.effective)),
    [444, 650, 800],
  );
  const p = await db.product.findUniqueOrThrow({
    where: { id: productId },
    include: { categories: true },
  });
  assert.equal(productPrice(withCampaign(p, config)).price, 800);
  const quote = await quoteCart(db, items(), shippingId);
  assert.equal(quote.subtotal, 800);
  assert.equal(quote.total, 950);
  assert.equal(quote.blackFriday, true);
  const variant = await quoteCart(
    db,
    [{ productId: saleId, variantId, quantity: 1, options: {} }],
    shippingId,
  );
  assert.equal(variant.subtotal, 960);
});

test('category off blocks direct checkout and rewards even for products in another visible category', async () => {
  await db.category.update({ where: { id: categoryId }, data: { enabled: false } });
  assert.equal(await db.product.count({ where: { id: productId, ...storefrontProductWhere } }), 0);
  assert.equal(
    (await availableGifts()).some((g) => g.id === giftId),
    false,
  );
  await assert.rejects(quoteCart(db, items(), shippingId), /no longer available/);
  if (origin) {
    assert.equal((await request(`/api/catalog/${productId}`)).status, 404);
    for (const path of [`/product/${tag}-product`, `/shop?category=${tag}`]) {
      const response = await request(path);
      // Next.js can stream the shell with 200 before notFound() resolves.
      assert.ok([200, 404].includes(response.status));
      const html = await response.text();
      assert.match(html, /name="robots" content="noindex/);
      assert.ok(!html.includes(`href="/product/${tag}-product"`));
    }
  }
  await db.category.update({ where: { id: categoryId }, data: { enabled: true } });
  assert.equal(await db.product.count({ where: { id: productId, ...storefrontProductWhere } }), 1);
  assert.equal(await db.product.count({ where: { id: draftId, ...storefrontProductWhere } }), 0);
  assert.equal(
    (await availableGifts()).some((g) => g.id === giftId),
    true,
  );
});

test('Black Friday cannot stack with points or gifts, including a mixed cart', async () => {
  for (const rewards of [
    { discountPoints: 100, giftId: '' },
    { discountPoints: 0, giftId },
  ])
    await assert.rejects(
      quoteCart(db, [...items(), ...items(plainId)], shippingId, userId, rewards),
      /Black Friday/,
    );
  assert.equal((await db.rewardsAccount.findUniqueOrThrow({ where: { userId } })).balance, 1000);
});

test('orders retain promotional totals, retries are idempotent, and expired or disabled campaigns restore prices', async () => {
  const data = { ...input(), expectedTotal: 950 };
  const { order } = await createOrder(data);
  assert.equal(order.total, 950);
  await save({ ...config, enabled: false });
  assert.equal((await createOrder(data)).order.id, order.id);
  assert.equal((await quoteCart(db, items(), shippingId)).total, 1050);
  await assert.rejects(createOrder({ ...input(), expectedTotal: 950 }), /Prices changed/);
  await save({ ...config, endsOn: '2020-01-02' });
  assert.equal((await quoteCart(db, items(), shippingId)).blackFriday, false);
  const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
  assert.equal(p.price, 1000);
  assert.equal(p.salePrice, 900);
  assert.equal(p.published, true);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).total, 950);
  await save(config);
});

test(
  'admin campaign and category APIs require authentication, reject bad schedules and support immediate off',
  { skip: !origin },
  async () => {
    assert.equal((await request('/api/admin/campaigns/black-friday', 'PUT', config)).status, 401);
    assert.equal(
      (await request('/api/admin/campaigns/black-friday', 'PUT', config, true, true)).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/api/admin/campaigns/black-friday',
          'PUT',
          { ...config, discountPercent: 100 },
          true,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request('/api/admin/campaigns/black-friday', 'PUT', { ...config, startsOn: '' }, true))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          '/api/admin/campaigns/black-friday',
          'PUT',
          { ...config, productIds: ['missing-id'] },
          true,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request('/api/admin/campaigns/black-friday', 'PUT', config, true)).status,
      200,
    );
    const catalog = await request(`/api/catalog/${productId}`);
    assert.equal((await catalog.json()).blackFridayPercent, 20);
    assert.equal(
      (await request('/api/admin/campaigns/black-friday', 'PATCH', { enabled: false }, true))
        .status,
      200,
    );
    assert.equal((await quoteCart(db, items(), shippingId)).blackFriday, false);
    assert.equal(
      (await request(`/api/admin/categories/${categoryId}`, 'PATCH', { enabled: false })).status,
      401,
    );
    assert.equal(
      (await request(`/api/admin/categories/${categoryId}`, 'PATCH', { enabled: false }, true))
        .status,
      200,
    );
    assert.equal((await request(`/api/catalog/${productId}`)).status, 404);
    assert.equal(
      (await request(`/api/admin/categories/${categoryId}`, 'PATCH', { enabled: true }, true))
        .status,
      200,
    );
    await save(config);
  },
);

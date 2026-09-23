import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { hash as passwordHash } from 'bcryptjs';
import { db } from '../../src/lib/db';
import { createOrder, updateOrderStatus } from '../../src/lib/checkout';
import { optimizeImage, storePrivateFile, getFile, deleteFile } from '../../src/lib/storage';
import sharp from 'sharp';
const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if (!process.env.DATABASE_URL?.includes('127.0.0.1') && !process.env.TEST_DATABASE_CONFIRMED)
  throw Error(
    'Integration tests require a local disposable database or TEST_DATABASE_CONFIRMED=true. Never run against live customer data.',
  );
const suffix = randomUUID().slice(0, 8);
const email = `qa-${suffix}@example.test`;
const pass = randomBytes(24).toString('hex');
let adminId = '';
let cookie = '';
let productId = '';
let variantId = '';
let customId = '';
const fileKeys: string[] = [];
async function request(path: string, method = 'GET', body?: unknown, admin = false) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(admin ? { Cookie: cookie } : {}),
      ...(!(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  return response;
}
const data = () => ({
  items: [{ productId, variantId, quantity: 1, options: {} }],
  shippingMethodId: 'standard',
  firstName: 'Integration',
  lastName: suffix,
  email,
  phone: '+38970123456',
  city: 'Скопје',
  postalCode: '1000',
  street: 'QA Street 1',
  country: 'MK',
  notes: 'Automated integration test',
  idempotencyKey: randomUUID(),
  acceptTerms: true,
});
before(async () => {
  const user = await db.user.create({
    data: { email, name: 'QA admin', role: 'ADMIN', passwordHash: await passwordHash(pass, 12) },
  });
  adminId = user.id;
  const login = await request('/api/auth/login', 'POST', { email, password: pass, admin: true });
  assert.equal(login.status, 200, await login.text());
  cookie = login.headers.get('set-cookie')!.split(';')[0];
  const p = await db.product.create({
    data: {
      name: 'QA Product ' + suffix,
      slug: 'qa-' + suffix,
      sku: 'QA-' + suffix,
      price: 690,
      salePrice: 590,
      shortDescription: 'QA',
      description: 'QA test',
      published: true,
      inventoryMode: 'IN_STOCK',
      trackInventory: true,
      stock: 10,
      variants: { create: { name: 'Graphite', sku: 'QA-V-' + suffix, price: 750, stock: 10 } },
    },
    include: { variants: true },
  });
  productId = p.id;
  variantId = p.variants[0].id;
});
after(async () => {
  await db.order.deleteMany({ where: { email } });
  await db.customer.deleteMany({ where: { email } });
  await db.product.deleteMany({
    where: { OR: [{ id: productId }, { sku: { startsWith: 'QA-' + suffix } }] },
  });
  await db.customPrintRequest.deleteMany({ where: { email } });
  await db.contactMessage.deleteMany({ where: { email } });
  await db.newsletterSubscriber.deleteMany({ where: { email } });
  await db.user.deleteMany({ where: { id: adminId } });
  await Promise.allSettled(fileKeys.map(deleteFile));
  await db.$disconnect();
});
test('admin pages redirect; APIs and private downloads reject anonymous callers', async () => {
  for (const url of ['/admin', '/admin/products', '/admin/customers', '/admin/settings']) {
    const r = await request(url);
    assert.ok([307, 308].includes(r.status), `${url}: ${r.status}`);
  }
  assert.equal((await request('/api/admin/products', 'POST', {})).status, 401);
  assert.equal((await request('/api/admin/files/nope')).status, 401);
});
test('invalid password and cross-origin writes are rejected', async () => {
  assert.equal(
    (await request('/api/auth/login', 'POST', { email, password: 'incorrect' })).status,
    401,
  );
  const r = await fetch(origin + '/api/contact', {
    method: 'POST',
    headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(r.status, 403);
});
test('all admin views render for an administrator', async () => {
  for (const url of [
    '/admin',
    '/admin/products',
    '/admin/products/' + productId,
    '/admin/categories',
    '/admin/orders',
    '/admin/customers',
    '/admin/custom-orders',
    '/admin/messages',
    '/admin/newsletter',
    '/admin/settings',
  ]) {
    const r = await request(url, 'GET', undefined, true);
    const html = await r.text();
    assert.equal(r.status, 200, url);
    assert.equal(html.includes('NEXT_HTTP_ERROR_FALLBACK;500'), false, url);
  }
});
test('invalid checkout, empty cart, negative quantity, missing fields reject', async () => {
  for (const body of [
    {},
    { ...data(), items: [] },
    { ...data(), items: [{ productId, variantId, quantity: -1 }] },
    { ...data(), phone: '' },
  ])
    assert.equal((await request('/api/checkout', 'POST', body)).status, 400);
});
test('server prices override frontend prices and stock decrements once', async () => {
  const input = data();
  const r = await request('/api/checkout', 'POST', {
    ...input,
    subtotal: 1,
    total: 1,
    shipping: 0,
    items: [{ ...input.items[0], price: 1 }],
  });
  assert.equal(r.status, 200, await r.clone().text());
  const body = await r.json();
  const order = await db.order.findUniqueOrThrow({
    where: { number: body.number },
    include: { items: true, history: true },
  });
  assert.equal(order.total, 900);
  assert.equal(order.items[0].unitPrice, 750);
  assert.equal(order.history.length, 1);
  const stock = (await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
  const again = await createOrder(input);
  assert.equal(again.order.id, order.id);
  assert.equal(
    (await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    stock,
  );
  const anon = await request(body.url);
  assert.equal(anon.status, 404);
  const privatePage = await fetch(origin + body.url, {
    headers: { Cookie: r.headers.get('set-cookie')!.split(';')[0] },
  });
  assert.equal(privatePage.status, 200);
});
test('disabled variant, removed product, and out of stock reject', async () => {
  await db.productVariant.update({ where: { id: variantId }, data: { enabled: false } });
  await assert.rejects(() => createOrder(data()));
  await db.productVariant.update({ where: { id: variantId }, data: { enabled: true } });
  await assert.rejects(() =>
    createOrder({ ...data(), items: [{ productId: 'deleted-product', quantity: 1 }] }),
  );
  await db.product.update({ where: { id: productId }, data: { inventoryMode: 'OUT_OF_STOCK' } });
  await assert.rejects(() => createOrder(data()));
  await db.product.update({ where: { id: productId }, data: { inventoryMode: 'IN_STOCK' } });
});
test('concurrent checkout cannot oversell; failed transaction leaves no order', async () => {
  await db.productVariant.update({ where: { id: variantId }, data: { stock: 1 } });
  const a = data(),
    b = data();
  const outcomes = await Promise.allSettled([createOrder(a), createOrder(b)]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 0);
  assert.equal(
    await db.order.count({
      where: { idempotencyKey: { in: [a.idempotencyKey, b.idempotencyKey] } },
    }),
    1,
  );
});
test('duplicate cart lines cannot bypass aggregated stock validation', async () => {
  await db.productVariant.update({ where: { id: variantId }, data: { stock: 1 } });
  const d = data();
  await assert.rejects(() => createOrder({ ...d, items: [d.items[0], d.items[0]] }));
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 1);
});
test('cancellation restores inventory exactly once', async () => {
  await db.productVariant.update({ where: { id: variantId }, data: { stock: 5 } });
  const { order } = await createOrder(data());
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 4);
  await updateOrderStatus(order.id, 'CANCELLED', 'QA');
  await updateOrderStatus(order.id, 'CANCELLED', 'QA repeat');
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 5);
  await assert.rejects(() => updateOrderStatus(order.id, 'CONFIRMED', ''));
});
test('made-to-order allows zero stock and follows complete production workflow', async () => {
  await db.product.update({
    where: { id: productId },
    data: { inventoryMode: 'MADE_TO_ORDER', trackInventory: false },
  });
  await db.productVariant.update({ where: { id: variantId }, data: { stock: 0 } });
  const { order } = await createOrder(data());
  for (const status of ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'] as const) {
    const r = await request(
      `/api/admin/orders/${order.id}`,
      'PATCH',
      { status, internalNotes: 'QA production' },
      true,
    );
    assert.equal(r.status, 200, await r.text());
  }
  assert.equal(await db.orderStatusHistory.count({ where: { orderId: order.id } }), 6);
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 0);
});
test('invalid slug and duplicate slug are rejected by real product mutations', async () => {
  const base = {
    name: 'QA',
    slug: '../bad',
    sku: 'QA-' + suffix + '-invalid',
    shortDescription: 'test',
    description: 'test',
    price: 500,
    salePrice: null,
    published: false,
    featured: false,
    bestseller: false,
    isNew: false,
    inventoryMode: 'MADE_TO_ORDER',
    trackInventory: false,
    stock: 0,
    lowStockThreshold: 3,
    categoryIds: [],
    specifications: [],
  };
  assert.equal((await request('/api/admin/products', 'POST', base, true)).status, 400);
  assert.equal(
    (await request('/api/admin/products', 'POST', { ...base, slug: 'qa-' + suffix }, true)).status,
    409,
  );
});
test('image upload checks actual content and generates persistent WebP sizes', async () => {
  const bad = new FormData();
  bad.set('files', new File(['<?php echo 1; ?>'], 'bad.jpg', { type: 'image/jpeg' }));
  assert.equal(
    (await request(`/api/admin/products/${productId}/images`, 'POST', bad, true)).status,
    400,
  );
  const bytes = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: '#ef5928' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set('files', new File([new Uint8Array(bytes)], 'product.png', { type: 'image/png' }));
  const res = await request(`/api/admin/products/${productId}/images`, 'POST', form, true);
  assert.equal(res.status, 200, await res.clone().text());
  const [img] = await res.json();
  assert.equal(img.width, 1600);
  for (const size of [400, 800, 1600]) {
    const key = `images/${img.filename}-${size}.webp`;
    fileKeys.push(key);
    const stored = await getFile(key);
    const meta = await sharp(stored).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, size);
  }
  assert.equal((await request(img.url)).status, 200);
  await assert.rejects(() =>
    optimizeImage(new File(['<svg/>'], 'vector.svg', { type: 'image/svg+xml' })),
  );
});
test('private custom design uploads are stored and require an authenticated admin download', async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: 'QA Design',
    email,
    phone: '+38970123456',
    description: 'Private fixture',
    quantity: '1',
  }))
    form.set(key, value);
  form.set(
    'file',
    new File(['solid qa\nendsolid qa'], 'private.stl', { type: 'application/octet-stream' }),
  );
  const res = await request('/api/custom-orders', 'POST', form);
  assert.equal(res.status, 200, await res.text());
  const record = await db.customPrintRequest.findFirstOrThrow({
    where: { email },
    include: { files: true },
  });
  customId = record.id;
  const file = record.files[0];
  fileKeys.push(file.key);
  assert.equal((await request('/api/media/' + file.key)).status, 404);
  assert.equal((await request('/api/admin/files/' + file.id)).status, 401);
  const download = await request('/api/admin/files/' + file.id, 'GET', undefined, true);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') || '', /attachment/);
  assert.match(await download.text(), /solid qa/);
  assert.equal(
    (
      await request(
        '/api/admin/custom-orders/' + customId,
        'PATCH',
        { status: 'REVIEWING', internalNotes: 'Test' },
        true,
      )
    ).status,
    200,
  );
});
test('contact messages and newsletter subscriptions persist without duplicates', async () => {
  assert.equal(
    (
      await request('/api/contact', 'POST', {
        name: 'QA',
        email,
        phone: '',
        subject: 'QA test',
        message: 'QA body',
      })
    ).status,
    200,
  );
  for (let i = 0; i < 2; i++)
    assert.equal((await request('/api/newsletter', 'POST', { email })).status, 200);
  assert.equal(await db.newsletterSubscriber.count({ where: { email } }), 1);
  assert.equal(await db.contactMessage.count({ where: { email } }), 1);
});
test('existing options can add colours without destroying variant relations', async () => {
  const option = await db.productOption.create({
    data: {
      productId,
      name: 'Finish',
      required: false,
      values: { create: { value: 'Matte', swatch: '#333333' } },
    },
    include: { values: true },
  });
  const response = await request(
    `/api/admin/products/${productId}/options/${option.id}`,
    'PUT',
    {
      name: 'Finish',
      required: false,
      values: [
        { id: option.values[0].id, value: 'Matte', swatch: '#333333' },
        { value: 'Gloss', swatch: '#eeeeee' },
      ],
    },
    true,
  );
  assert.equal(response.status, 200, await response.text());
  assert.equal(await db.productOptionValue.count({ where: { optionId: option.id } }), 2);
});
test('delivered revenue date is unchanged by admin note edits', async () => {
  const { order } = await createOrder(data());
  for (const status of ['CONFIRMED', 'READY', 'SHIPPED', 'DELIVERED'] as const)
    await updateOrderStatus(order.id, status, '');
  const delivered = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.ok(delivered.deliveredAt);
  await updateOrderStatus(order.id, 'DELIVERED', 'Later note');
  assert.equal(
    (await db.order.findUniqueOrThrow({ where: { id: order.id } })).deliveredAt?.getTime(),
    delivered.deliveredAt?.getTime(),
  );
});
test('invalid order numbers and missing products render safe 404 pages', async () => {
  for (const p of [
    '/order-confirmation/GX-2026-99999999',
    '/order-confirmation/invalid',
    '/product/no-such-product-qa',
  ])
    assert.equal((await request(p)).status, 404);
});

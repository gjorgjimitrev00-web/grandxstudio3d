import 'dotenv/config';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db } from '../../src/lib/db';
import { hash } from '../../src/lib/security';

const database = new URL(process.env.DATABASE_URL || 'http://invalid');
const origin = new URL(process.env.TEST_BASE_URL || 'http://invalid');
if (
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  !/test|preview/.test(database.pathname) ||
  !['localhost', '127.0.0.1'].includes(origin.hostname)
)
  throw Error('Use an isolated local test database and site.');

const tag = `review-${randomUUID()}`;
const number = 'GX-2099-' + Math.floor(Math.random() * 1000000000 + 1000000);
const guestToken = randomBytes(32).toString('hex');
const guestCookie = `gx-order-${number}=${guestToken}`;
let owner = '',
  other = '',
  manager = '',
  customerId = '',
  orderId = '',
  shippingId = '',
  productId = '',
  gifted = '',
  otherProduct = '';
const sessions: string[] = [];
const products: string[] = [];
let img: Uint8Array<ArrayBuffer>;
let src = '';

async function userCookie(admin = false) {
  const token = randomBytes(30).toString('hex');
  const user = await db.user.create({
    data: {
      name: tag,
      email: randomUUID() + '@example.test',
      role: admin ? 'ADMIN' : 'CUSTOMER',
      passwordHash: 'unused',
      sessions: { create: { tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000) } },
    },
  });
  sessions.push(user.id);
  return { cookie: 'gx-session=' + token, id: user.id };
}
async function product(suffix: string) {
  const name = tag + suffix;
  const p = await db.product.create({
    data: {
      name,
      slug: name,
      sku: name,
      shortDescription: 'Review fixture',
      description: 'Review fixture',
      price: 250,
      published: true,
    },
  });
  products.push(p.id);
  return p;
}
before(async () => {
  const buyer = await userCookie();
  owner = buyer.cookie;
  other = (await userCookie()).cookie;
  manager = (await userCookie(true)).cookie;
  customerId = (
    await db.customer.create({
      data: {
        userId: buyer.id,
        firstName: 'Review',
        lastName: 'Buyer',
        email: tag + '@example.test',
        phone: 'local-test',
      },
    })
  ).id;
  const p = await product('-p');
  productId = p.id;
  src = '/product/' + p.slug;
  gifted = (await product('-gift')).id;
  otherProduct = (await product('-no')).id;
  shippingId = (await db.shippingMethod.create({ data: { name: tag, kind: 'PICKUP', price: 0 } }))
    .id;
  orderId = (
    await db.order.create({
      data: {
        number,
        idempotencyKey: tag,
        accessTokenHash: hash(guestToken),
        customerId,
        firstName: 'A',
        lastName: 'B',
        email: tag + '@example.test',
        phone: '123',
        street: 'Test',
        city: 'Test',
        postalCode: '1000',
        subtotal: 250,
        shipping: 0,
        total: 250,
        shippingMethodId: shippingId,
        shippingName: tag,
        items: {
          create: [
            {
              productId,
              name: tag,
              sku: tag,
              quantity: 1,
              unitPrice: 250,
              subtotal: 250,
              madeToOrder: true,
            },
            {
              productId: gifted,
              name: tag + '-gift',
              sku: tag + '-gift',
              quantity: 1,
              unitPrice: 0,
              subtotal: 0,
              madeToOrder: true,
              rewardGift: true,
            },
          ],
        },
      },
    })
  ).id;
  img = new Uint8Array(
    await sharp({ create: { width: 1030, height: 300, channels: 3, background: 'steelblue' } })
      .png()
      .toBuffer(),
  );
});
after(async () => {
  if (orderId) await db.order.deleteMany({ where: { id: orderId } });
  if (products.length) await db.product.deleteMany({ where: { id: { in: products } } });
  if (customerId) await db.customer.deleteMany({ where: { id: customerId } });
  if (sessions.length) await db.user.deleteMany({ where: { id: { in: sessions } } });
  if (shippingId) await db.shippingMethod.deleteMany({ where: { id: shippingId } });
  await db.$disconnect();
});

const path = '/order-confirmation/' + number + '/reviews';
function request(url: string, method = 'GET', cookie = '', body?: FormData | string) {
  const headers: Record<string, string> = { Origin: origin.origin, Cookie: cookie };
  if (typeof body === 'string') headers['Content-Type'] = 'application/json';
  return fetch(new URL(url, origin), { method, headers, body });
}
function form({
  product = productId,
  consent = true,
  image,
  body = tag,
}: { product?: string; consent?: boolean; image?: Uint8Array<ArrayBuffer>; body?: string } = {}) {
  const data = new FormData();
  data.set('productId', product);
  data.set('rating', '4');
  data.set('body', body);
  if (consent) data.set('consent', 'yes');
  if (image) data.set('photo', new Blob([image], { type: 'image/png' }), 'photo.png');
  return data;
}

test('only the delivered buyer or valid guest receipt can submit, only for purchased items with consent', async () => {
  assert.equal((await request(path, 'POST', guestCookie, form())).status, 409);
  await db.order.update({
    where: { id: orderId },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });
  assert.equal((await request(path, 'POST', '', form())).status, 404);
  assert.equal((await request(path, 'POST', other, form())).status, 404);
  assert.equal((await request(path, 'POST', manager, form())).status, 404);
  assert.equal((await request(path, 'POST', `gx-order-${number}=bad`, form())).status, 404);
  assert.equal((await request(path, 'POST', owner, form({ product: otherProduct }))).status, 400);
  assert.equal((await request(path, 'POST', guestCookie, form({ product: gifted }))).status, 400);
  assert.equal((await request(path, 'POST', guestCookie, form({ consent: false }))).status, 400);
  assert.equal(
    (await request(path, 'POST', owner, form({ image: new Uint8Array([1, 2, 3]) }))).status,
    400,
  );
  assert.equal(await db.productReview.count({ where: { orderId } }), 0);
});
test('one review per purchased product, private through moderation, visible only while approved', async () => {
  const body = 'Verified sample ' + tag;
  const replies = await Promise.all([
    request(path, 'POST', owner, form({ body, image: img })),
    request(path, 'POST', guestCookie, form({ body, image: img })),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
  const posted = await replies.find((r) => r.status === 201)!.json();
  const photo = '/api/reviews/' + posted.id + '/photo';
  const admin = '/api/admin/reviews/' + posted.id;
  assert.equal(posted.status, 'PENDING');
  assert.equal((await request(photo)).status, 404);
  assert.equal((await request(admin + '/photo')).status, 401);
  const adminPhoto = await request(admin + '/photo', 'GET', manager);
  assert.equal(adminPhoto.status, 200);
  const normalized = await sharp(Buffer.from(await adminPhoto.arrayBuffer())).metadata();
  assert.equal(normalized.format, 'webp');
  assert.equal(normalized.width, 960);
  assert.equal(normalized.exif, undefined);
  assert.ok(!(await (await request(src)).text()).includes(body));
  assert.equal(
    (
      await request(
        admin,
        'PATCH',
        other,
        JSON.stringify({ expectedStatus: 'PENDING', status: 'APPROVED' }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        admin,
        'PATCH',
        manager,
        JSON.stringify({ expectedStatus: 'PENDING', status: 'APPROVED' }),
      )
    ).status,
    200,
  );
  assert.equal((await request(photo)).status, 200);
  const publicPage = await (await request(src)).text();
  assert.ok(publicPage.includes(body));
  assert.ok(!publicPage.includes(tag + '@example.test'));
  assert.equal(
    (
      await request(
        admin,
        'PATCH',
        manager,
        JSON.stringify({ expectedStatus: 'PENDING', status: 'REJECTED' }),
      )
    ).status,
    409,
  );
  await db.product.update({ where: { id: productId }, data: { published: false } });
  assert.equal((await request(photo)).status, 404);
  await db.product.update({ where: { id: productId }, data: { published: true } });
  assert.equal(
    (
      await request(
        admin,
        'PATCH',
        manager,
        JSON.stringify({ expectedStatus: 'APPROVED', status: 'REJECTED' }),
      )
    ).status,
    200,
  );
  assert.equal((await request(photo)).status, 404);
  assert.ok(!(await (await request(src)).text()).includes(body));
});

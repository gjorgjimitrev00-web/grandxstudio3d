import 'dotenv/config';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/lib/db';
import {
  getOrCreateKeychainStarter,
  setKeychainPreview,
  validateStarterPublication,
} from '../../src/lib/keychain-admin';
import { createOrder, quoteCart } from '../../src/lib/checkout';
import { cartSchema } from '../../src/lib/validation';
import { KEYCHAIN_STARTER_ID, keychainOptions } from '../../src/lib/keychain-preview';

const target = new URL(process.env.DATABASE_URL || 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/test|preview/.test(target.pathname))
  throw Error('Keychain integration tests require an isolated local test database.');
const tag = randomUUID(),
  email = tag + '@example.test';
let productId = '';
after(async () => {
  await db.order.deleteMany({ where: { email } });
  await db.customer.deleteMany({ where: { email } });
  if (productId) await db.product.deleteMany({ where: { id: productId } });
  await db.$disconnect();
});

test('setup, fresh approval, order snapshots and stale cart rejection', async () => {
  const product = await db.product.create({
    data: {
      name: 'Keychain QA ' + tag,
      slug: 'keychain-qa-' + tag,
      sku: 'K-' + tag,
      price: 200,
      shortDescription: 'Local QA',
      description: 'Local QA',
      published: true,
    },
  });
  productId = product.id;
  const createSettings = {
    enabled: true,
    nameOptionId: 'new',
    colorOptionId: 'new',
    colors: [{ value: 'Sage', swatch: '#A0B050' }],
  };
  await setKeychainPreview(productId, createSettings);
  // A retried request should use the pair already created, without duplicate mandatory fields.
  await setKeychainPreview(productId, createSettings);
  const options = await db.productOption.findMany({
    where: { productId },
    include: { values: true },
  });
  assert.equal(options.length, 2);
  const config = keychainOptions(options)!;
  assert.ok(config);
  const design = { name: 'Софија', color: 'Sage', hex: '#A0B050' };
  const item = {
    productId,
    quantity: 1,
    options: { [config.text.id]: design.name, [config.color.id]: design.color },
    keychain: design,
  };
  const quote = (data: unknown) => quoteCart(db, cartSchema.parse([data]), 'standard');
  await assert.rejects(quote({ ...item, keychain: undefined }), /approve/);
  await assert.rejects(quote({ ...item, keychain: { ...design, name: 'Иван' } }), /approve/);
  const input = {
    items: [
      item,
      {
        ...item,
        keychain: { ...design, name: 'Иван' },
        options: { ...item.options, [config.text.id]: 'Иван' },
      },
    ],
    shippingMethodId: 'standard',
    firstName: 'Local',
    lastName: 'Tester',
    email,
    phone: '070123456',
    city: 'Скопје',
    postalCode: '1000',
    street: 'Test 1',
    country: 'MK',
    idempotencyKey: randomUUID(),
    acceptTerms: true,
  };
  const { order: created } = await createOrder(input);
  assert.equal((await createOrder(input)).order.number, created.number);
  await db.productOptionValue.update({
    where: { id: config.color.values[0].id },
    data: { swatch: '#163E40' },
  });
  await assert.rejects(quote(item), /approve/);
  const stored = await db.orderItem.findMany({
    where: { order: { number: created.number } },
    include: { selections: true },
  });
  assert.equal(stored.length, 2);
  const names = stored
    .map((i) => i.selections.find((s) => s.optionName === config.text.name)?.value)
    .sort();
  assert.deepEqual(names, ['Иван', 'Софија'].sort());
  for (const line of stored)
    assert.equal(
      line.selections.find((s) => s.optionName === config.color.name)?.value,
      'Sage (#A0B050)',
    );
  await setKeychainPreview(productId, { enabled: false });
  await assert.rejects(quote(item), /no longer available/);
  assert.equal((await quote({ ...item, keychain: undefined })).subtotal, 200);
});

test('starter action opens one unpublished draft and requires a real price and palette for first publication', async () => {
  const existing = await db.product.findUnique({ where: { id: KEYCHAIN_STARTER_ID } });
  try {
    const [a, b] = await Promise.all([getOrCreateKeychainStarter(), getOrCreateKeychainStarter()]);
    assert.equal(a.id, b.id);
    if (existing) {
      // An isolated preview database might already have a studio-edited draft.
      assert.deepEqual(await db.product.findUnique({ where: { id: a.id } }), existing);
      return;
    }
    const draft = await db.product.findUniqueOrThrow({
      where: { id: a.id },
      include: { options: true },
    });
    assert.equal(draft.published, false);
    assert.equal(draft.price, 0);
    assert.deepEqual(
      draft.options.map((o) => o.kind),
      ['TEXT'],
    );
    await assert.rejects(
      validateStarterPublication(db, a.id, { published: true, price: 0, salePrice: null }),
      /actual selling price/,
    );
    await assert.rejects(
      validateStarterPublication(db, a.id, { published: true, price: 200, salePrice: null }),
      /available colors/,
    );
    await db.product.update({
      where: { id: a.id },
      data: { name: 'Owner chose a name', price: 240 },
    });
    await getOrCreateKeychainStarter();
    const preserved = await db.product.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(preserved.name, 'Owner chose a name');
    assert.equal(preserved.price, 240);
  } finally {
    if (!existing) await db.product.deleteMany({ where: { id: KEYCHAIN_STARTER_ID } });
  }
});

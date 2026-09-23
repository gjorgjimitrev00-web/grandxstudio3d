import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartSchema, checkoutSchema, slug, password } from '../src/lib/validation';
import { money, safeJsonLd } from '../src/lib/utils';
test('rejects empty carts, negative, fractional, and excessive quantities', () => {
  for (const items of [
    [],
    [{ productId: 'x', quantity: -1 }],
    [{ productId: 'x', quantity: 1.5 }],
    [{ productId: 'x', quantity: 100 }],
  ])
    assert.equal(cartSchema.safeParse(items).success, false);
});
test('strips untrusted frontend prices and totals', () => {
  const parsed = cartSchema.parse([
    { productId: 'x', quantity: 1, price: 1, total: 1, stock: 999 },
  ]);
  assert.equal('price' in parsed[0], false);
});
test('rejects traversal and malformed slugs', () => {
  for (const value of ['../admin', 'hello world', 'Uppercase', 'a/b', 'x--y'])
    assert.equal(slug.safeParse(value).success, false);
});
test('checkout requires identity, address and accepted terms', () =>
  assert.equal(
    checkoutSchema.safeParse({ items: [{ productId: 'x', quantity: 1 }] }).success,
    false,
  ));
test('password bounds use UTF-8 bytes for bcrypt safety', () => {
  assert.equal(password.safeParse('short').success, false);
  assert.equal(password.safeParse('😀'.repeat(25)).success, false);
  assert.equal(password.safeParse('a secure long password').success, true);
});
test('structured data cannot terminate its script element', () =>
  assert.equal(safeJsonLd({ name: '</script><script>alert(1)</script>' }).includes('<'), false));
test('MKD display groups thousands', () => assert.equal(money(2500), '2.500 ден.'));
import { skopjeMidnight } from '../src/lib/time';
test('revenue reporting uses correct local midnight across summer and winter', () => {
  assert.equal(skopjeMidnight(2026, 9, 1).toISOString(), '2026-08-31T22:00:00.000Z');
  assert.equal(skopjeMidnight(2026, 1, 1).toISOString(), '2025-12-31T23:00:00.000Z');
});

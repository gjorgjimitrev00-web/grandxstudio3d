import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { manualOrderSchema, manualSaleDate, manualTotals } from '../src/lib/manual-order-rules';
import { studioDay, studioDayStart, shiftDay, validDay } from '../src/lib/time';

function input() {
  return {
    idempotencyKey: randomUUID(),
    date: '2026-10-20',
    status: 'DELIVERED',
    paid: true,
    paymentMethod: 'CASH',
    fulfillment: 'PICKUP',
    shipping: 0,
    adjustStock: true,
    items: [{ name: 'Custom sign', quantity: 2, unitPrice: 500 }],
  };
}
test('manual totals use agreed whole-MKD prices and delivery', () => {
  assert.deepEqual(
    manualTotals(
      [
        { quantity: 2, unitPrice: 450 },
        { quantity: 1, unitPrice: 700 },
      ],
      180,
    ),
    { subtotal: 1600, shipping: 180, total: 1780 },
  );
  assert.equal(manualOrderSchema.parse(input()).firstName, '');
  for (const unitPrice of [-1, 0.5, '500', Infinity, 10000001])
    assert.equal(
      manualOrderSchema.safeParse({ ...input(), items: [{ name: 'Test', quantity: 1, unitPrice }] })
        .success,
      false,
    );
  for (const quantity of [0, -1, 1.5, 1000])
    assert.equal(
      manualOrderSchema.safeParse({
        ...input(),
        items: [{ name: 'Test', quantity, unitPrice: 500 }],
      }).success,
      false,
    );
  assert.equal(
    manualOrderSchema.safeParse({
      ...input(),
      items: [{ name: 'Test', quantity: 999, unitPrice: 10000000 }],
    }).success,
    false,
  );
});
test('pending payment, missing custom names, foreign variants and delivery fields are validated', () => {
  for (const patch of [
    { status: 'NEW' },
    { shipping: 150 },
    { fulfillment: 'DELIVERY' },
    { items: [{ quantity: 1, unitPrice: 500 }] },
    { items: [{ name: 'Test', variantId: 'foreign', quantity: 1, unitPrice: 500 }] },
    { source: 'ONLINE' },
    { paidAt: '2026-10-20' },
  ])
    assert.equal(manualOrderSchema.safeParse({ ...input(), ...patch }).success, false);
  assert.ok(manualOrderSchema.safeParse({ ...input(), status: 'CONFIRMED', paid: false }).success);
  assert.ok(
    manualOrderSchema.safeParse({
      ...input(),
      fulfillment: 'DELIVERY',
      shipping: 180,
      firstName: 'Test',
      phone: '+38970000000',
      street: 'Test 1',
      city: 'Скопје',
    }).success,
  );
});
test('studio dates handle Macedonia midnight, leap days and DST rather than the server timezone', () => {
  assert.equal(studioDay(new Date('2026-10-19T22:30:00Z')), '2026-10-20');
  assert.equal(studioDayStart('2026-10-25').toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(studioDayStart('2026-10-26').toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(studioDayStart('2026-03-30').toISOString(), '2026-03-29T22:00:00.000Z');
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29');
  for (const invalid of ['2026-02-29', '2026-02-30', '2026-13-01', 'no date', '2026-1-1'])
    assert.equal(validDay(invalid), false);
  const now = new Date('2026-10-19T22:30:00Z');
  assert.equal(manualSaleDate('2026-10-20', now).toISOString(), '2026-10-19T22:00:00.000Z');
  assert.throws(() => manualSaleDate('2026-10-21', now));
  assert.throws(() => manualSaleDate('1999-12-31', now));
});

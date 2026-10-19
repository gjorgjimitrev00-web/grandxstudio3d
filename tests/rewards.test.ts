import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discountLimit,
  earnedPoints,
  refundTargets,
  rewardSelectionSchema,
} from '../src/lib/rewards-rules';

test('rewards use whole product MKD, exclude fees and respect balance and percentage caps', () => {
  assert.equal(earnedPoints(999, 20), 49);
  assert.equal(earnedPoints(0, 20), 0);
  assert.equal(discountLimit(501, 1000, 20), 100);
  assert.equal(discountLimit(3000, 80, 20), 80);
  assert.equal(discountLimit(3000, -30, 20), 0);
});
test('partial refunds use cumulative totals and restore gift points only after gift return', () => {
  const input = {
    netProducts: 2700,
    refundedProducts: 1350,
    discountPoints: 300,
    giftPoints: 250,
    giftReturned: false,
    earnEveryMkd: 20,
  };
  assert.deepEqual(refundTargets(input), { earned: 67, restored: 150 });
  assert.deepEqual(refundTargets({ ...input, refundedProducts: 2700 }), {
    earned: 0,
    restored: 300,
  });
  assert.deepEqual(refundTargets({ ...input, refundedProducts: 2700, giftReturned: true }), {
    earned: 0,
    restored: 550,
  });
});
test('reward selections reject negative, fractional, string and oversized point inputs', () => {
  for (const discountPoints of [-1, 0.5, '100', 10000001, Infinity])
    assert.equal(rewardSelectionSchema.safeParse({ discountPoints }).success, false);
  assert.deepEqual(rewardSelectionSchema.parse({ pointsEarned: 99999 }), {
    discountPoints: 0,
    giftId: '',
  });
});

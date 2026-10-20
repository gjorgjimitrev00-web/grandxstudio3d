import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blackFridaySchema,
  campaignStatus,
  campaignPercent,
  defaultBlackFriday,
  productPrice,
  withCampaign,
} from '../src/lib/campaign-rules';

const campaign = {
  ...defaultBlackFriday,
  enabled: true,
  startsOn: '2026-11-27',
  endsOn: '2026-11-30',
  discountPercent: 20,
  productIds: ['lamp'],
  categoryIds: ['vases'],
};

test('schedule uses Macedonian midnight and includes the entire final day', () => {
  assert.equal(campaignStatus(campaign, new Date('2026-11-26T22:59:59Z')), 'scheduled');
  assert.equal(campaignStatus(campaign, new Date('2026-11-26T23:00:00Z')), 'active');
  assert.equal(campaignStatus(campaign, new Date('2026-11-30T22:59:59Z')), 'active');
  assert.equal(campaignStatus(campaign, new Date('2026-11-30T23:00:00Z')), 'ended');
  assert.equal(campaignStatus({ ...campaign, enabled: false }, new Date('2026-11-28')), 'off');
});

test('summer dates and the daylight saving transition follow Europe/Skopje', () => {
  const summer = { ...campaign, startsOn: '2026-06-01', endsOn: '2026-06-01' };
  assert.equal(campaignStatus(summer, new Date('2026-05-31T21:59:59Z')), 'scheduled');
  assert.equal(campaignStatus(summer, new Date('2026-05-31T22:00:00Z')), 'active');
  assert.equal(campaignStatus(summer, new Date('2026-06-01T22:00:00Z')), 'ended');
  const autumn = { ...campaign, startsOn: '2026-10-25', endsOn: '2026-10-25' };
  assert.equal(campaignStatus(autumn, new Date('2026-10-24T22:00:00Z')), 'active');
  assert.equal(campaignStatus(autumn, new Date('2026-10-25T22:59:59Z')), 'active');
  assert.equal(campaignStatus(autumn, new Date('2026-10-25T23:00:00Z')), 'ended');
});

test('enabled campaigns need valid dates, targets and a bounded whole percentage', () => {
  assert.equal(blackFridaySchema.safeParse(defaultBlackFriday).success, true);
  for (const change of [
    { startsOn: '' },
    { endsOn: '' },
    { endsOn: '2026-11-20' },
    { startsOn: '2026-02-30' },
    { productIds: [], categoryIds: [] },
    { discountPercent: 0 },
    { discountPercent: 100 },
    { discountPercent: 1.5 },
  ])
    assert.equal(blackFridaySchema.safeParse({ ...campaign, ...change }).success, false);
});

test('selected products OR categories qualify, but scheduled and expired campaigns do not', () => {
  const now = new Date('2026-11-28');
  assert.equal(campaignPercent({ id: 'lamp' }, campaign, now), 20);
  assert.equal(
    campaignPercent({ id: 'vase', categories: [{ categoryId: 'vases' }] }, campaign, now),
    20,
  );
  assert.equal(campaignPercent({ id: 'chair' }, campaign, now), 0);
  assert.equal(campaignPercent({ id: 'lamp' }, campaign, new Date('2026-12-01')), 0);
});

test('pricing applies one discount and preserves a lower existing sale', () => {
  const p = { price: 1000, salePrice: 900, blackFridayPercent: 20 };
  assert.deepEqual(productPrice(p), { regularPrice: 1000, price: 800, blackFriday: true });
  assert.equal(productPrice({ ...p, salePrice: 700 }).price, 700);
  assert.equal(productPrice({ ...p, salePrice: 0 }).price, 0);
  assert.equal(
    productPrice({ ...p, price: 555, salePrice: null, blackFridayPercent: 10 }).price,
    500,
  );
});

test('explicit variant prices and adjustments receive the same campaign calculation', () => {
  const p = { price: 1000, salePrice: 900, blackFridayPercent: 20 };
  assert.equal(productPrice(p, { price: 1200, priceAdjustment: 50 }).price, 960);
  assert.equal(productPrice(p, { price: null, priceAdjustment: 200 }).price, 960);
  assert.equal(productPrice(p, { price: null, priceAdjustment: -200 }).price, 640);
  assert.equal(
    productPrice({ ...p, blackFridayPercent: 0 }, { price: 1200, priceAdjustment: 50 }).price,
    1200,
  );
});

test('disabling the module restores the existing price without rewriting product data', () => {
  const p = { id: 'lamp', price: 500, salePrice: 450 };
  const before = { ...p };
  const now = new Date('2026-11-28');
  assert.equal(productPrice(withCampaign(p, campaign, now)).price, 400);
  assert.equal(productPrice(withCampaign(p, { ...campaign, enabled: false }, now)).price, 450);
  assert.deepEqual(p, before);
});

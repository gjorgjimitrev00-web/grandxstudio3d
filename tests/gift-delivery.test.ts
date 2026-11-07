import assert from 'node:assert/strict';
import test from 'node:test';
import { giftPricing, giftTags } from '../src/lib/gift-finder';
import { deliveryProgressSettings } from '../src/lib/cart-delivery';

test('gift prices only use purchasable variants and the actual campaign/sale price', () => {
  const base = {
    price: 1300,
    salePrice: 1100,
    trackInventory: true,
    stock: 0,
    inventoryMode: 'IN_STOCK',
    blackFridayPercent: 25,
    variants: [
      { enabled: true, stock: 0, price: 350, priceAdjustment: 0 },
      { enabled: true, stock: 2, price: null, priceAdjustment: 100 },
      { enabled: false, stock: 3, price: 200, priceAdjustment: 0 },
    ],
  };
  assert.deepEqual(giftPricing(base), { price: 1050, varies: false });
  assert.equal(giftPricing({ ...base, variants: [] }), null);
  assert.equal(giftPricing({ ...base, inventoryMode: 'OUT_OF_STOCK' }), null);
});
test('gift curation replaces automatic suggestions, including intentionally empty selections', () => {
  const p = { name: 'Ребреста вазна', slug: 'vazna', categories: [], giftProfile: null };
  assert.ok(giftTags(p).occasions.includes('home'));
  assert.deepEqual(
    giftTags({ ...p, giftProfile: { occasions: ['anniversary'], recipients: ['partner'] } }),
    { occasions: ['anniversary'], recipients: ['partner'] },
  );
  assert.deepEqual(giftTags({ ...p, giftProfile: { occasions: [], recipients: [] } }), {
    occasions: [],
    recipients: [],
  });
});
test('delivery progress uses eligible delivery methods and excludes free pickup', () => {
  const pickup = { id: 'pickup', kind: 'PICKUP', price: 0, freeThreshold: null };
  const standard = { id: 'standard', kind: 'STANDARD', price: 150, freeThreshold: 3000 };
  assert.equal(deliveryProgressSettings([pickup]), null);
  assert.deepEqual(deliveryProgressSettings([pickup, standard]), {
    threshold: 3000,
    quoteMethodId: 'standard',
  });
  assert.deepEqual(
    deliveryProgressSettings([
      standard,
      { id: 'free', kind: 'FREE', price: 0, freeThreshold: 2500 },
    ]),
    { threshold: 2500, quoteMethodId: 'standard' },
  );
});

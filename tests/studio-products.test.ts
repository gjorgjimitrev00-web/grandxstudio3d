import test from 'node:test';
import assert from 'node:assert/strict';
import { selectStudioProducts } from '../src/lib/studio-products';

test('a large seasonal collection cannot crowd out the other studio collections', () => {
  const seasonal = Array.from({ length: 12 }, (_, i) => ({ id: `christmas-${i}` }));
  const lamp = { id: 'lamp' };
  const vase = { id: 'vase' };
  const phoneHolder = { id: 'phone-holder' };
  const selected = selectStudioProducts([seasonal, [lamp], [vase], [phoneHolder]], seasonal);

  assert.equal(selected.length, 8);
  for (const product of [lamp, vase, phoneHolder]) assert.ok(selected.includes(product));
});

test('products in multiple categories appear once and recent products fill empty slots', () => {
  const lamp = { id: 'lamp' };
  const vase = { id: 'vase' };
  const recent = [lamp, vase, { id: 'new-gift' }, { id: 'new-holder' }];
  const selected = selectStudioProducts([[lamp, vase], [], [lamp]], recent, 4);

  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map((product) => product.id)).size, 4);
  assert.ok(selected.some((product) => product.id === 'new-gift'));
  assert.deepEqual(selectStudioProducts([], recent, 2), recent.slice(0, 2));
  assert.deepEqual(selectStudioProducts([], []), []);
});

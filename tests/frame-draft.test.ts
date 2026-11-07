import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_PHOTO_COUNTS, type FrameTemplate } from '../src/lib/frame-artwork';
import {
  deserializeFrameDraft,
  serializeFrameDraft,
  type FrameDraftState,
} from '../src/lib/frame-draft';

function partialDraft(): FrameDraftState {
  const crops = Object.fromEntries(
    Object.entries(FRAME_PHOTO_COUNTS).map(([name, count]) => [
      name,
      Array.from({ length: count }, () => ({ zoom: 1, panX: 0.5, panY: 0.5 })),
    ]),
  ) as FrameDraftState['crops'];
  crops.love[2] = { zoom: 2.4, panX: 0.08, panY: 0.91 };
  return {
    template: 'love',
    size: '5x7',
    paper: 'glossy',
    locale: 'mk',
    orientation: 'landscape',
    fit: 'contain',
    names: ' Ана и Лука ',
    date: '20.06.',
    caption: 'Уште пишувам… 🧡',
    selected: 2,
    crops,
    files: [
      null,
      null,
      new File([Uint8Array.of(1, 2, 3)], 'фото.jpg', { type: 'image/jpeg', lastModified: 321 }),
      null,
      new File([Uint8Array.of(4, 5)], 'дизајн.png', { type: 'image/png', lastModified: 456 }),
    ],
  };
}

test('unfinished poster and custom artwork survive a structured clone with original bytes, file metadata, crop and empty slots', async () => {
  const { files, ...fields } = partialDraft();
  const stored = structuredClone(serializeFrameDraft({ ...fields, files }));
  const { files: restored, ...rest } = deserializeFrameDraft(stored);
  assert.deepEqual(rest, fields);
  assert.deepEqual(
    restored.map((f) => f?.name ?? null),
    files.map((f) => f?.name ?? null),
  );
  for (const slot of [2, 4]) {
    assert.ok(restored[slot] instanceof File);
    assert.equal(restored[slot].type, files[slot]!.type);
    assert.equal(restored[slot].lastModified, files[slot]!.lastModified);
    assert.deepEqual(await restored[slot].arrayBuffer(), await files[slot]!.arrayBuffer());
  }
});

test('allowlisted draft ignores prices, consent, customer data and temporary image URLs', () => {
  const state = {
    ...partialDraft(),
    consent: true,
    price: 900,
    customer: { phone: 'example' },
    src: 'blob:old-session',
  };
  const record = serializeFrameDraft(state);
  const rest = deserializeFrameDraft({ ...record, ...{ src: state.src, price: state.price } });
  for (const field of ['consent', 'price', 'customer', 'src']) {
    assert.equal(Object.hasOwn(record, field), false);
    assert.equal(Object.hasOwn(rest, field), false);
  }
});

test('malformed snapshots cannot restore external URLs, unsupported files, invalid gallery slots or crops', () => {
  const saved = serializeFrameDraft(partialDraft());
  for (const invalid of [
    { ...saved, files: ['https://example.invalid/photo', null, null, null, null] },
    {
      ...saved,
      files: [
        { name: 'file.svg', lastModified: 1, blob: new Blob(['test'], { type: 'image/svg+xml' }) },
        null,
        null,
        null,
        null,
      ],
    },
    { ...saved, files: [] },
    { ...saved, selected: 4 },
    { ...saved, crops: { ...saved.crops, love: [{ zoom: 4, panX: 0, panY: 0 }] } },
    { ...saved, version: 2 },
    { ...saved, template: 'unknown' as FrameTemplate },
  ])
    assert.throws(() => deserializeFrameDraft(invalid));
});

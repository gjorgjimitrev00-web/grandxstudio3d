import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  effectiveFramePpi,
  FRAME_SIZES,
  frameDesignSchema,
  framePaperDimensions,
  renderFrameSvg,
  type FrameDesign,
} from '../src/lib/frame-artwork';
import { FrameArtworkError, renderFrameArtwork } from '../src/lib/frame-render';

const center = { zoom: 1, panX: 0.5, panY: 0.5 };
const basic: FrameDesign = {
  template: 'custom',
  size: '4x6',
  names: '',
  caption: '',
  date: '',
  crops: [center],
};
function extractJpeg(pdf: Buffer): Buffer {
  const start = pdf.indexOf(Buffer.from([255, 216, 255]));
  const end = pdf.indexOf(Buffer.from([255, 217]), start + 3);
  assert.ok(start > 0 && end > start);
  return pdf.subarray(start, end + 2);
}

test('sheet dimensions and effective source resolution follow orientation, crop, fit, and actual physical photo area', () => {
  assert.deepEqual(framePaperDimensions({ ...basic, size: 'A3+', orientation: 'landscape' }), {
    widthMm: 483,
    heightMm: 329,
  });
  const landscape = [{ src: 'blob:photo', width: 1200, height: 600 }];
  assert.deepEqual(effectiveFramePpi(basic, landscape), [300]); // Letterboxed, 4 x 2 inch image on a 4 x 6 sheet.
  assert.deepEqual(effectiveFramePpi({ ...basic, fit: 'cover' }, landscape), [100]); // Cover uses full six-inch height.
  assert.deepEqual(
    effectiveFramePpi({ ...basic, crops: [{ ...center, zoom: 2 }] }, landscape),
    [150],
  );
  for (const size of Object.keys(FRAME_SIZES) as (keyof typeof FRAME_SIZES)[]) {
    const original = FRAME_SIZES[size],
      svg = renderFrameSvg({ ...basic, size }, []);
    assert.ok(svg.includes(`viewBox="0 0 ${original.widthMm} ${original.heightMm}"`));
  }
});

test('print layouts enforce exact slot count and reject unprintable characters without silently losing a name', () => {
  const four = {
    ...basic,
    names: 'Ѓорѓи & Љубица',
    template: 'love',
    crops: Array(4).fill(center),
  };
  assert.ok(frameDesignSchema.safeParse(four).success);
  assert.equal(frameDesignSchema.safeParse({ ...four, crops: [center] }).success, false);
  assert.equal(frameDesignSchema.safeParse({ ...four, caption: 'Hi 🐶' }).success, false);
  assert.equal(frameDesignSchema.safeParse({ ...four, orientation: 'landscape' }).success, false);
  const svg = renderFrameSvg({ ...basic, template: 'story', names: '<img>' }, [
    { src: 'javascript:alert(1)', width: 100, height: 50 },
  ]);
  assert.doesNotMatch(svg, /javascript:|<img>/);
});

test('an EXIF-rotated upload prints upright as a 300 dpi sRGB page with the exact frame dimensions', async () => {
  const input = await sharp({
    create: { width: 900, height: 600, channels: 3, background: '#CC3333' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const { pdf, preview, effectivePpi } = await renderFrameArtwork(basic, [input]);
  assert.deepEqual(effectivePpi, [150]); // 600 x 900 oriented source, matches a 4 x 6 sheet.
  assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 288\.0+ 432\.0+\]/);
  assert.match(pdf.toString('latin1'), /\/ColorSpace \[\/ICCBased 6 0 R\]/);
  const jpeg = extractJpeg(pdf),
    metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1800);
  assert.ok(metadata.icc);
  const { data } = await sharp(jpeg)
    .extract({ left: 600, top: 10, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 150 && data[1] < 100); // Would be white if EXIF/fit were ignored.
  const thumb = await sharp(preview).metadata();
  assert.equal(thumb.width, 560);
  assert.equal(thumb.height, 840);
});

test('invalid, animated, missing, and insufficient-resolution uploads cannot produce print files', async () => {
  const tiny = await sharp({
    create: { width: 120, height: 180, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const apng = Buffer.from(tiny);
  apng.write('acTL', 12, 'ascii'); // APNG control chunk must be rejected before decoding.
  for (const rejected of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), apng, tiny])
    await assert.rejects(renderFrameArtwork(basic, [rejected]), FrameArtworkError);
  await assert.rejects(renderFrameArtwork(basic, []), FrameArtworkError);
});

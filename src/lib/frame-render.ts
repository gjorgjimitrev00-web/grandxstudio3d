import sharp from 'sharp';
import { deflateSync } from 'node:zlib';
import {
  effectiveFramePpi,
  FRAME_FILE_MAX,
  FRAME_FILES_MAX,
  FRAME_MIN_PPI,
  FRAME_PHOTO_COUNTS,
  FRAME_TARGET_PPI,
  frameDesignSchema,
  framePaperDimensions,
  renderFrameSvg,
  type FrameDesign,
  type FramePhoto,
} from './frame-artwork';

export class FrameArtworkError extends Error {}
const MAX_PIXELS = 40_000_000;
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const options = { limitInputPixels: MAX_PIXELS, failOn: 'warning' as const };

function isAllowedRaster(input: Buffer) {
  if (input.subarray(0, 8).equals(PNG_HEADER)) {
    // Some PNG decoders expose only the first APNG frame. Reject the animation control chunk.
    let offset = 8;
    while (offset + 12 <= input.length) {
      const length = input.readUInt32BE(offset);
      if (input.toString('ascii', offset + 4, offset + 8) === 'acTL') return false;
      if (length > input.length - offset - 12) return false;
      offset += 12 + length;
    }
    return true;
  }
  return (
    (input[0] === 255 && input[1] === 216 && input[2] === 255) ||
    (input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP')
  );
}
async function dimensions(file: Buffer) {
  if (!isAllowedRaster(file))
    throw new FrameArtworkError('Please upload a still JPEG, PNG or WebP image.');
  const meta = await sharp(file, options)
    .metadata()
    .catch(() => null);
  if (
    !meta ||
    !['jpeg', 'png', 'webp'].includes(meta.format) ||
    (meta.pages ?? 1) > 1 ||
    !meta.width ||
    !meta.height ||
    meta.width * meta.height > MAX_PIXELS
  )
    throw new FrameArtworkError(
      'This image could not be used. Choose a still image of up to 40 megapixels.',
    );
  return { src: '', width: meta.autoOrient.width, height: meta.autoOrient.height };
}
async function normalizedPhoto(file: Buffer, photo: FramePhoto, ppi: number, design: FrameDesign) {
  // Only the printable resolution needs to be embedded in the compositing scene.
  const scale = Math.min(1, 360 / ppi);
  const background = { love: '#FFF8ED', story: '#FFF8F0', moments: '#2f3330', custom: '#ffffff' }[
    design.template
  ];
  const jpeg = await sharp(file, options)
    .autoOrient()
    .resize(
      Math.max(1, Math.round(photo.width * scale)),
      Math.max(1, Math.round(photo.height * scale)),
      { fit: 'fill' },
    )
    .flatten({ background })
    .withIccProfile('srgb', { attach: false })
    .jpeg({ quality: 96, chromaSubsampling: '4:4:4' })
    .toBuffer()
    .catch(() => {
      throw new FrameArtworkError(
        'The image could not be decoded. Try exporting a new JPEG or PNG.',
      );
    });
  return { ...photo, src: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
}

// An exact-size, one-page PDF: one sRGB JPEG image, an embedded ICC profile, and a
// standard cross-reference table. Artwork is rendered at print resolution, independently
// of the visitor's device, browser zoom, or screen capture resolution.
function pagePdf(
  jpeg: Buffer,
  icc: Buffer,
  pxWidth: number,
  pxHeight: number,
  mmWidth: number,
  mmHeight: number,
) {
  const w = ((mmWidth * 72) / 25.4).toFixed(6),
    h = ((mmHeight * 72) / 25.4).toFixed(6);
  const drawing = Buffer.from(`q\n${w} 0 0 ${h} 0 0 cm\n/Artwork Do\nQ\n`, 'ascii');
  const stream = (entries: string, data: Buffer) =>
    Buffer.concat([
      Buffer.from(`<< ${entries} /Length ${data.length} >>\nstream\n`, 'ascii'),
      data,
      Buffer.from('\nendstream'),
    ]);
  const bounds = `[0 0 ${w} ${h}]`;
  const objects: (Buffer | string)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox ${bounds} /TrimBox ${bounds} /Resources << /XObject << /Artwork 5 0 R >> >> /Contents 4 0 R >>`,
    stream('', drawing),
    stream(
      `/Type /XObject /Subtype /Image /Width ${pxWidth} /Height ${pxHeight} /BitsPerComponent 8 /ColorSpace [/ICCBased 6 0 R] /Filter /DCTDecode`,
      jpeg,
    ),
    stream('/N 3 /Alternate /DeviceRGB /Filter /FlateDecode', deflateSync(icc)),
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((obj, i) => {
    offsets.push(length);
    const data = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      typeof obj === 'string' ? Buffer.from(obj) : obj,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(data);
    length += data.length;
  });
  const crossRefs = offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${crossRefs}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}

export async function renderFrameArtwork(input: FrameDesign, files: Buffer[]) {
  const parsed = frameDesignSchema.safeParse(input);
  if (!parsed.success)
    throw new FrameArtworkError(parsed.error.issues[0]?.message || 'Invalid poster layout.');
  const design = parsed.data;
  if (files.length !== FRAME_PHOTO_COUNTS[design.template])
    throw new FrameArtworkError('Upload every image for the chosen layout.');
  if (
    files.some(
      (file) => !Buffer.isBuffer(file) || file.length === 0 || file.length > FRAME_FILE_MAX,
    ) ||
    files.reduce((n, f) => n + f.length, 0) > FRAME_FILES_MAX
  )
    throw new FrameArtworkError('Upload images up to 12 MiB each and 32 MiB total.');
  const photos: FramePhoto[] = [];
  for (const file of files) photos.push(await dimensions(file));
  const effectivePpi = effectiveFramePpi(design, photos);
  const low = effectivePpi.findIndex((ppi) => ppi < FRAME_MIN_PPI);
  if (low >= 0)
    throw new FrameArtworkError(
      `Photo ${low + 1} is ${effectivePpi[low]} ppi after cropping. Use a larger source, zoom out, or choose a smaller print (minimum ${FRAME_MIN_PPI} ppi).`,
    );
  // Sequential decoding bounds peak memory on shared hosting.
  for (let i = 0; i < photos.length; i++)
    photos[i] = await normalizedPhoto(files[i], photos[i], effectivePpi[i], design);
  const svg = Buffer.from(renderFrameSvg(design, photos, FRAME_TARGET_PPI));
  // This SVG is generated exclusively from checked numeric geometry, trusted glyphs
  // and re-encoded images. 'unlimited' allows large inline JPEGs in librsvg's XML parser.
  const page = await sharp(svg, {
    density: 72,
    limitInputPixels: MAX_PIXELS,
    unlimited: true,
  })
    .withIccProfile('srgb')
    .jpeg({ quality: 97, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true });
  const metadata = await sharp(page.data).metadata();
  if (!metadata.icc) throw new Error('Print renderer failed to attach the sRGB profile.');
  const { widthMm, heightMm } = framePaperDimensions(design);
  const pdf = pagePdf(
    page.data,
    metadata.icc,
    page.info.width,
    page.info.height,
    widthMm,
    heightMm,
  );
  const preview = await sharp(page.data)
    .resize({ width: 840, height: 840, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  return { pdf, preview, effectivePpi };
}

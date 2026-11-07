import { z } from 'zod';
import lettering from './frame-type/lettering.json';
import sansSupplement from './frame-type/sans-supplement.json';

// Page dimensions are finished paper dimensions. The preview and the PDF share this scene.
export const FRAME_SIZES = {
  '4x6': { widthMm: 101.6, heightMm: 152.4 },
  '5x7': { widthMm: 127, heightMm: 177.8 },
  '8x10': { widthMm: 203.2, heightMm: 254 },
  A5: { widthMm: 148, heightMm: 210 },
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  'A3+': { widthMm: 329, heightMm: 483 },
} as const;
export type FrameSize = keyof typeof FRAME_SIZES;
export const FRAME_PHOTO_COUNTS = {
  love: 4,
  story: 1,
  moments: 3,
  anniversary: 2,
  baptism: 1,
  birthday: 1,
  custom: 1,
} as const;
export type FrameTemplate = keyof typeof FRAME_PHOTO_COUNTS;
export const FRAME_PHOTO_MATS: Record<FrameTemplate, string> = {
  love: '#FFF8ED',
  story: '#FFF8F0',
  moments: '#2f3330',
  anniversary: '#F2E9D8',
  baptism: '#F3F0E6',
  birthday: '#FFFBF1',
  custom: '#ffffff',
};
export const FRAME_FILE_MAX = 12 * 1024 * 1024;
export const FRAME_FILES_MAX = 32 * 1024 * 1024;
export const FRAME_MIN_PPI = 150;
export const FRAME_TARGET_PPI = 300;

// Outlines and advances from the original OFL-licensed poster fonts, normalized to 1000
// em units. Thus browser and print have identical glyphs even on hosts without any fonts.
type Face = 'display' | 'italic' | 'sans';
type Font = { glyphs: Record<string, [number, string]>; kern: Record<string, number> };
const originalFonts = lettering as unknown as Record<Face, Font>;
// The studio's Jost file lacks several Cyrillic letters. Matching Latin forms and
// additional OFL Noto Sans outlines keep those dates printable in both renderers.
const fonts = {
  ...originalFonts,
  sans: {
    ...originalFonts.sans,
    glyphs: {
      ...originalFonts.sans.glyphs,
      ...z.record(z.string(), z.tuple([z.number(), z.string()])).parse(sansSupplement),
    },
  },
};
const inputText = (length: number, face: Face) =>
  z
    .string()
    .max(length)
    .trim()
    .transform((s) => s.normalize('NFC'))
    .refine(
      (s) => [...s].every((c) => Object.hasOwn(fonts[face].glyphs, c)),
      'Use supported Latin or Cyrillic lettering and punctuation.',
    );

export const frameDesignSchema = z
  .object({
    size: z.enum(Object.keys(FRAME_SIZES) as [FrameSize, ...FrameSize[]]),
    template: z.enum(Object.keys(FRAME_PHOTO_COUNTS) as [FrameTemplate, ...FrameTemplate[]]),
    locale: z.enum(['mk', 'en']).optional(),
    names: inputText(60, 'display'),
    date: inputText(32, 'sans'),
    caption: inputText(100, 'italic'),
    fit: z.enum(['contain', 'cover']).optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),
    crops: z
      .array(
        z.object({
          zoom: z.number().min(1).max(3),
          panX: z.number().min(0).max(1),
          panY: z.number().min(0).max(1),
        }),
      )
      .max(4),
  })
  .refine(
    (d) => d.crops.length === FRAME_PHOTO_COUNTS[d.template],
    'Supply a crop for each photo in this design.',
  )
  .refine(
    (d) => d.template === 'custom' || d.orientation !== 'landscape',
    'The photo poster templates are portrait.',
  );
export type FrameDesign = z.infer<typeof frameDesignSchema>;
export type FramePhoto = { src: string; width: number; height: number };
export type FrameCrop = FrameDesign['crops'][number];
type Box = { x: number; y: number; w: number; h: number };
const defaultCrop: FrameCrop = { zoom: 1, panX: 0.5, panY: 0.5 };
const loveBox = { x: 5, y: 5, w: 109, h: 74 };
const storyBox = { x: 33, y: 137, w: 231, h: 174 };
const momentsBoxes = [56, 145, 234].map((y) => ({ x: 48, y, w: 201, h: 76 }));
const anniversaryBoxes = [
  { x: 24, y: 100, w: 119, h: 155 },
  { x: 154, y: 117, w: 119, h: 155 },
];
const baptismBox = { x: 63, y: 85, w: 171, h: 195 };
const birthdayBox = { x: 50, y: 106, w: 197, h: 162 };
const cards = [
  { x: 25, y: 124, angle: -3, label: '01 / THE LITTLE THINGS' },
  { x: 154, y: 127, angle: 3, label: '02 / YOU + ME' },
  { x: 27, y: 236, angle: 2.5, label: '03 / JUST LIKE THIS' },
  { x: 154, y: 234, angle: -2.5, label: '04 / ALWAYS US' },
];
const round = (value: number) => +value.toFixed(5);
const escape = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!,
  );
export function framePaperDimensions(
  design: Pick<FrameDesign, 'template' | 'size' | 'orientation'>,
) {
  const size = FRAME_SIZES[design.size];
  return design.template === 'custom' && design.orientation === 'landscape'
    ? { widthMm: size.heightMm, heightMm: size.widthMm }
    : size;
}
function sheet(design: FrameDesign) {
  const { widthMm: w, heightMm: h } = framePaperDimensions(design);
  const scale = Math.min(w / 297, h / 420);
  return { w, h, scale, dx: (w - 297 * scale) / 2, dy: (h - 420 * scale) / 2 };
}
function boxes(design: FrameDesign): Box[] {
  if (design.template === 'love') return cards.map(() => loveBox);
  if (design.template === 'story') return [storyBox];
  if (design.template === 'moments') return momentsBoxes;
  if (design.template === 'anniversary') return anniversaryBoxes;
  if (design.template === 'baptism') return [baptismBox];
  if (design.template === 'birthday') return [birthdayBox];
  const { w, h } = sheet(design);
  return [{ x: 0, y: 0, w, h }];
}
function placement(photo: FramePhoto, crop: FrameCrop, box: Box, contain: boolean) {
  const widthRatio = box.w / photo.width,
    heightRatio = box.h / photo.height;
  const scale =
    (contain ? Math.min(widthRatio, heightRatio) : Math.max(widthRatio, heightRatio)) * crop.zoom;
  const w = photo.width * scale,
    h = photo.height * scale;
  return { x: box.x + (box.w - w) * crop.panX, y: box.y + (box.h - h) * crop.panY, w, h, scale };
}
export function effectiveFramePpi(design: FrameDesign, photos: readonly (FramePhoto | null)[]) {
  const custom = design.template === 'custom';
  return boxes(design).map((box, i) => {
    const p = photos[i];
    if (!p || p.width <= 0 || p.height <= 0) return 0;
    const { scale } = placement(
      p,
      design.crops[i] || defaultCrop,
      box,
      custom && design.fit !== 'cover',
    );
    return Math.floor(25.4 / (scale * (custom ? 1 : sheet(design).scale)) + 0.000001);
  });
}
function rectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  border?: string,
  weight = 0.3,
) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${border ? ` stroke="${border}" stroke-width="${weight}"` : ''}/>`;
}
function text(
  value: string,
  face: Face,
  size: number,
  x: number,
  y: number,
  maxWidth: number,
  color: string,
  tracking = 0,
) {
  if (!value) return '';
  const chars = [...value.normalize('NFC')],
    font = fonts[face];
  let cursor = 0;
  const glyphs = chars.map((ch, i) => {
    // Invalid draft characters use a visible question mark. The order schema rejects them.
    const glyph = font.glyphs[ch] || font.glyphs['?'];
    const offset = cursor;
    cursor +=
      ((glyph[0] + (font.kern[ch + (chars[i + 1] || '')] || 0)) * size) / 1000 +
      (i < chars.length - 1 ? tracking : 0);
    return glyph[1]
      ? `<path transform="translate(${round(offset)} 0) scale(${round(size / 1000)})" d="${glyph[1]}"/>`
      : '';
  });
  const fit = cursor > maxWidth ? maxWidth / cursor : 1;
  return `<g aria-label="${escape(value)}" fill="${color}" transform="translate(${round(x - (cursor * fit) / 2)} ${y}) scale(${round(fit)})">${glyphs.join('')}</g>`;
}
function image(
  photo: FramePhoto | null | undefined,
  crop: FrameCrop,
  box: Box,
  index: number,
  contain = false,
  silhouette?: { path: string; mat: string },
) {
  const clip = `frame-clip-${index}-${[box.x, box.y, box.w, box.h].join('-').replace(/\./g, '_')}`;
  const aperture = (fill: string) =>
    silhouette
      ? `<path d="${silhouette.path}" fill="${fill}"/>`
      : rectangle(box.x, box.y, box.w, box.h, fill);
  if (
    !photo ||
    photo.width <= 0 ||
    photo.height <= 0 ||
    !/^(?:blob:|data:image\/(?:png|jpeg|webp);base64,|\/(?!\/))/.test(photo.src)
  )
    return aperture(silhouette?.mat ?? '#edd9d7');
  const p = placement(photo, crop, box, contain);
  return `<defs><clipPath id="${clip}">${aperture('white')}</clipPath></defs><g clip-path="url(#${clip})">${silhouette ? aperture(silhouette.mat) : ''}<image x="${round(p.x)}" y="${round(p.y)}" width="${round(p.w)}" height="${round(p.h)}" preserveAspectRatio="none" xlink:href="${escape(photo.src)}"/></g>`;
}
const cherry = '#BC213D',
  cream = '#FFF8ED';
function checker(design: FrameDesign) {
  const { w, h, scale } = sheet(design),
    cell = 6 * scale;
  let squares = '';
  for (const edge of [0, h - cell * 2])
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < w / cell; col++) {
        if ((row + col) % 2 === 0)
          squares += rectangle(
            round(col * cell),
            round(edge + row * cell),
            round(cell),
            round(cell),
            cherry,
          );
      }
  return squares;
}
function love(design: FrameDesign, photos: readonly (FramePhoto | null)[]) {
  const small = design.size === '4x6';
  const postCards = cards
    .map((card, i) => {
      const tape =
        i === 0 || i === 3
          ? '<path d="M42 -4 L46 -3 L48 -4 L51 -3 L54 -4 L57 -3 L61 -4 L64 -3 L68 -4 L71 -3 L75 -4 L74 4 L71 3 L68 4 L65 3 L62 4 L58 3 L55 4 L51 3 L48 4 L45 3 L42 4 Z" fill="#EBA8BF" stroke="#BC213D" stroke-width=".15"/>'
          : '';
      return `<g transform="translate(${card.x} ${card.y}) rotate(${card.angle} 59.5 48.5)">${rectangle(1.2, 1.5, 119, 97, '#DCA0B1')}${rectangle(0, 0, 119, 97, cream, cherry, 0.35)}${image(photos[i], design.crops[i] || defaultCrop, loveBox, i)}${rectangle(5, 5, 109, 74, 'none', cherry, small ? 0.3 : 0.2)}${text(card.label, 'sans', small ? 6.2 : 3.2, 59.5, 89, 106, cherry, 0.36)}${tape}</g>`;
    })
    .join('');
  return [
    text(
      'THE LITTLE MOMENTS. THE BIG FEELINGS.',
      'sans',
      small ? 6.2 : 3,
      148.5,
      31,
      245,
      cherry,
      0.6,
    ),
    text('LOVE,', 'display', 57, 148.5, 77, 237, cherry),
    text('in every frame.', 'italic', 20.5, 148.5, 101, 239, cherry),
    '<path d="M31 82 L33 88 L39 90 L33 92 L31 98 L29 92 L23 90 L29 88 Z M264 88 L266 93 L271 95 L266 97 L264 102 L262 97 L257 95 L262 93 Z" fill="#BC213D"/>',
    postCards,
    `<g transform="translate(148 222) rotate(-9)"><path d="M0 -3 C-8 -15 -24 -5 -17 5 C-13 11 -5 16 0 20 C5 16 13 11 17 5 C24 -5 8 -15 0 -3 Z" fill="${cherry}" stroke="${cream}" stroke-width=".8"/>${text('xo', 'italic', 12, 0, 8, 29, cream)}</g>`,
    text(design.names, 'display', 17, 148.5, 361, 241, cherry),
    text(
      design.date ? 'TOGETHER SINCE ' + design.date : '',
      'sans',
      small ? 6.2 : 3.2,
      148.5,
      375,
      244,
      cherry,
      0.6,
    ),
    text(design.caption, 'italic', small ? 8.3 : 6.4, 148.5, 392, 246, cherry),
  ].join('');
}
function scallop() {
  const corners = [
    [27, 131],
    [270, 131],
    [270, 317],
    [27, 317],
    [27, 131],
  ];
  let path = 'M27 131';
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i],
      dx = corners[i + 1][0] - x,
      dy = corners[i + 1][1] - y;
    const n = dx ? 34 : 26;
    for (let j = 0; j < n; j++)
      path += ` Q${round(x + (dx * (j + 0.5)) / n + Math.sign(dy) * 2.5)} ${round(y + (dy * (j + 0.5)) / n - Math.sign(dx) * 2.5)} ${round(x + (dx * (j + 1)) / n)} ${round(y + (dy * (j + 1)) / n)}`;
  }
  return path + ' Z';
}
function story(design: FrameDesign, photos: readonly (FramePhoto | null)[]) {
  const red = '#A31C36';
  const heart = (x: number, y: number, s: number, r: number) =>
    `<path transform="translate(${x} ${y}) rotate(${r}) scale(${s})" d="M0 3 C-2 -1 -8 -.5 -8 4.3 C-8 8 -2.5 10.6 0 13 C2.5 10.6 8 8 8 4.3 C8 -.5 2 -1 0 3 Z" fill="none" stroke="${red}" stroke-width=".8"/>`;
  return [
    rectangle(11.5, 11.5, 274, 397, 'none', red, 0.4),
    text('OUR LITTLE FOREVER', 'sans', 3.1, 148.5, 28, 200, red, 0.9),
    text('the story of', 'italic', 13.5, 148.5, 52, 230, red),
    text('us', 'italic', 82, 148.5, 110, 190, red),
    heart(85, 83, 0.67, -13),
    heart(212, 76, 0.48, 15),
    `<path d="M76 96 Q79 99 83 99 M218 72 l2 -3 M222 77 l4 -1" fill="none" stroke="${red}" stroke-width=".6"/><path d="${scallop()}" fill="#FFF8F0" stroke="${red}" stroke-width=".5"/>`,
    image(photos[0], design.crops[0] || defaultCrop, storyBox, 0),
    rectangle(33, 137, 231, 174, 'none', red, 0.3),
    `<g transform="translate(250 316) rotate(-10)" fill="#F8E1E4" stroke="${red}" stroke-width=".75" stroke-linejoin="round"><path d="M-1 0 C-9 -13 -24 -13 -21 -4 C-18 3 -7 3 -1 0 Z M1 0 C9 -13 23 -12 20 -4 C17 3 7 3 1 0 Z"/><path d="M-1 1 C-7 6 -6 14 -15 18 L-15 13 L-20 14 C-10 8 -10 5 -4 0 M1 1 C5 9 3 16 12 21 L12 16 L17 17 C7 9 10 5 4 0"/><ellipse rx="2.8" ry="2.2"/></g>`,
    text(design.names, 'display', 17, 148.5, 350, 235, red),
    text(design.date ? 'SINCE ' + design.date : '', 'sans', 3.5, 148.5, 367, 235, red, 0.65),
    text(design.caption, 'italic', 6.8, 148.5, 389, 235, red),
    `<path d="M146.5 399 C145 396 141.5 398.3 146.5 402 C151.5 398.3 148 396 146.5 399 Z" fill="${red}"/>`,
  ].join('');
}
function moments(design: FrameDesign, photos: readonly (FramePhoto | null)[]) {
  const ink = '#2f3330',
    accent = '#886347';
  const strips = momentsBoxes
    .map((box, i) => image(photos[i], design.crops[i] || defaultCrop, box, i))
    .join('');
  let holes = '';
  for (let y = 54; y < 314; y += 9)
    for (const x of [38, 254]) holes += rectangle(x, y, 4.6, 3.5, '#efeadf');
  return [
    text('Our moments', 'italic', 27, 148.5, 33, 228, ink),
    rectangle(32, 47, 233, 272, ink),
    strips,
    holes,
    text(design.names, 'display', 18, 148.5, 352, 244, ink),
    text(design.date, 'sans', 5.2, 148.5, 367, 235, accent, 0.7),
    text(design.caption, 'italic', 7.3, 148.5, 390, 245, ink),
  ].join('');
}

function dedication(value: string, baseline: number, color: string) {
  // Long dedications are more legible on small prints when set on two balanced lines.
  const spaces = [...value.matchAll(/\s+/g)].map((match) => match.index);
  const middle = spaces.reduce<number | undefined>(
    (best, index) =>
      best === undefined || Math.abs(index - value.length / 2) < Math.abs(best - value.length / 2)
        ? index
        : best,
    undefined,
  );
  const lines =
    value.length > 38 && middle !== undefined
      ? [value.slice(0, middle).trim(), value.slice(middle).trim()]
      : [value];
  return lines
    .map((line, i) => text(line, 'italic', 8.4, 148.5, baseline + i * 11, 232, color))
    .join('');
}

function anniversary(design: FrameDesign, photos: readonly (FramePhoto | null)[]) {
  const ivory = FRAME_PHOTO_MATS.anniversary;
  const gold = '#D3B383';
  const plates = anniversaryBoxes.map((box, i) =>
    [
      rectangle(box.x - 2, box.y - 2, box.w + 4, box.h + 4, ivory),
      photos[i] ? image(photos[i], design.crops[i] || defaultCrop, box, i) : '',
    ].join(''),
  );
  return [
    rectangle(11, 11, 275, 398, 'none', gold, 0.55),
    // Offset ellipses give the paired portraits a single, understated ring motif.
    `<g fill="none" stroke="${gold}" stroke-width="1.05"><ellipse cx="143" cy="36" rx="10" ry="8" transform="rotate(-27 143 36)"/><ellipse cx="154" cy="36" rx="10" ry="8" transform="rotate(27 154 36)"/></g>`,
    text(design.locale === 'en' ? 'Anniversary' : 'Годишнина', 'italic', 32, 148.5, 78, 241, ivory),
    ...plates,
    `<path d="M24 277 H118 M179 97 H273" fill="none" stroke="${gold}" stroke-width=".55"/>`,
    text(design.names, 'display', 22, 148.5, 317, 247, ivory),
    text(design.date, 'sans', 7.4, 148.5, 341, 229, gold, 0.55),
    dedication(design.caption, 367, ivory),
    `<path d="M96 392 H144 M153 392 H201 M148.5 389.8 l2.2 2.2 -2.2 2.2 -2.2 -2.2 Z" fill="none" stroke="${gold}" stroke-width=".6"/>`,
  ].join('');
}

const baptismArch = 'M63 280 V170.5 a85.5 85.5 0 0 1 171 0 V280 Z';
function oliveSprig(mirrored: boolean) {
  // Each pair of tapered leaves follows its own part of the curved stem.
  const leaves = [
    [45, 264, -54],
    [45, 264, -3],
    [40, 250, -58],
    [40, 249, 0],
    [37, 236, -46],
    [37, 235, 13],
    [36, 222, -35],
    [36, 221, 22],
    [36.5, 212, 4],
  ];
  return `<g${mirrored ? ' transform="translate(297 0) scale(-1 1)"' : ''}>
    <path d="M55 281 Q31 250 37 208" fill="none" stroke="#5D6F5C" stroke-width="1.1" stroke-linecap="round"/>
    ${leaves.map(([x, y, angle]) => `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 0 Q-3.7 -8 .7 -15 Q5 -8 0 0 Z" fill="#829683"/>`).join('')}
  </g>`;
}
function baptism(design: FrameDesign, photos: readonly (FramePhoto | null)[]) {
  const ink = '#364C43',
    gold = '#A5895D';
  return [
    // A fine outer arch echoes the silhouette of the photographic aperture.
    `<path d="M58 287 V170.5 a90.5 90.5 0 0 1 181 0 V287 Z" fill="none" stroke="${gold}" stroke-width=".65"/>`,
    image(photos[0], design.crops[0] || defaultCrop, baptismBox, 0, false, {
      path: baptismArch,
      mat: FRAME_PHOTO_MATS.baptism,
    }),
    oliveSprig(false),
    oliveSprig(true),
    `<g fill="none" stroke="${gold}" stroke-linecap="round"><path d="M148.5 16 V36 M142.5 23 H154.5" stroke-width="1.4"/><path d="M135 20 l-2 -1 M162 20 l2 -1 M136 14 l-1.5 -2 M161 14 l1.5 -2" stroke-width=".6"/></g>`,
    text(
      design.locale === 'en' ? 'Holy Baptism' : 'Свето крштение',
      'display',
      22.7,
      148.5,
      62,
      246,
      ink,
    ),
    text(design.names, 'italic', 24.5, 148.5, 324, 239, ink),
    text(design.date, 'sans', 7.1, 148.5, 345, 229, ink, 0.55),
    dedication(design.caption, 368, ink),
    `<path d="M118 396 Q135 396 143 392 M154 392 Q162 396 179 396" fill="none" stroke="${gold}" stroke-width=".7"/><circle cx="148.5" cy="392" r="1.4" fill="${gold}"/>`,
  ].join('');
}

const birthdayWindow =
  'M58 106 H239 Q247 106 247 114 V260 Q247 268 239 268 H58 Q50 268 50 260 V114 Q50 106 58 106 Z';
function balloon(x: number, y: number, angle: number, fill: string, accent: string) {
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
    <path d="M0 19 C-8 34 10 45 1 65" fill="none" stroke="#665843" stroke-width=".85"/>
    <path d="M0 18 C-6 13 -13 5 -13 -4 C-13 -22 13 -22 13 -4 C13 5 6 13 0 18 Z M0 16 l-2 4 h4 Z" fill="${fill}"/>
    <path d="M-5 -14 Q-12 -4 -6 5" fill="none" stroke="${accent}" stroke-width="1.15" stroke-linecap="round"/>
  </g>`;
}
function birthday(design: FrameDesign, photos: readonly (FramePhoto | null)[]) {
  const ink = '#273F46';
  return [
    // A single curved cord and folded paper pennants across the top of the print.
    `<path d="M13 13 Q148.5 42 284 13" fill="none" stroke="#8C7055" stroke-width=".85"/>
     <path d="M36 18 l13 2.3 -8 13 Z M172 26 l13 -.6 -5.6 14 Z" fill="#CE7458"/>
     <path d="M69 23 l13 1.7 -7.8 12.8 Z M206 23.7 l13 -1.6 -5 13 Z" fill="#759798"/>
     <path d="M104 26 l13 .6 -7 13 Z M242 18.7 l13 -2.3 -4.8 13 Z" fill="#D8A541"/>`,
    text(
      design.locale === 'en' ? 'Happy birthday!' : 'Среќен роденден!',
      'display',
      28,
      148.5,
      77,
      255,
      ink,
    ),
    '<rect x="46" y="102" width="205" height="170" rx="11" fill="#FFFBF1" stroke="#C3A979" stroke-width=".65"/>',
    image(photos[0], design.crops[0] || defaultCrop, birthdayBox, 0, false, {
      path: birthdayWindow,
      mat: FRAME_PHOTO_MATS.birthday,
    }),
    balloon(25, 133, -9, '#D68661', '#F0BE99'),
    balloon(274, 226, 9, '#799B99', '#B8CDC0'),
    `<g fill="none" stroke-linecap="round" stroke-width="1.15"><path d="M29 233 l2 4 M39 244 l4 -2 M260 145 l3 -4" stroke="#BC7751"/><path d="M20 253 l4 -1 M267 169 l3 2 M277 144 l1 -4" stroke="#688A89"/></g>`,
    text(design.names, 'display', 25, 148.5, 318, 246, ink),
    text(design.date, 'sans', 7.3, 148.5, 341, 228, ink, 0.55),
    dedication(design.caption, 366, ink),
    '<g fill="none" stroke-width="1.05" stroke-linecap="round"><path d="M126 395 Q137 384 148.5 395 T171 395" stroke="#C8785C"/><path d="M126 398 Q137 387 148.5 398 T171 398" stroke="#7C9B95"/></g>',
  ].join('');
}
export function renderFrameSvg(
  design: FrameDesign,
  photos: readonly (FramePhoto | null)[],
  outputPpi?: number,
) {
  const { w, h, scale, dx, dy } = sheet(design);
  const width = outputPpi ? Math.round((w / 25.4) * outputPpi) : w + 'mm';
  const height = outputPpi ? Math.round((h / 25.4) * outputPpi) : h + 'mm';
  const bg = {
    love: '#F8C9D8',
    story: '#F8E1E4',
    moments: '#f7f2e7',
    anniversary: '#203344',
    baptism: '#F3F0E6',
    birthday: '#FFF1CF',
    custom: '#ffffff',
  }[design.template];
  const layouts = { love, story, moments, anniversary, baptism, birthday };
  const content =
    design.template === 'custom'
      ? image(
          photos[0],
          design.crops[0] || defaultCrop,
          boxes(design)[0],
          0,
          design.fit !== 'cover',
        )
      : `<g transform="translate(${dx} ${dy}) scale(${scale})">${layouts[design.template](design, photos)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Frame artwork">${rectangle(0, 0, w, h, bg)}${design.template === 'love' ? checker(design) : ''}${content}</svg>`;
}

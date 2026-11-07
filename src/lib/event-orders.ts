import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { serializable } from './checkout';
import { storefrontProductWhere } from './catalog-visibility';
import { hash, HttpError, orderToken, secureEqual } from './security';
import { studioDay, validDay } from './time';
import { rewardsSettings } from './rewards';
import { earnedPoints } from './rewards-rules';
import { isAllowedRaster } from './still-raster';

const field = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().refine(validDay, 'Invalid event or production date.');
const detailsSchema = z.object({
  requestKey: z.uuid(),
  productId: z.string().trim().max(191),
  name: field(150),
  company: z.string().trim().max(150),
  email: z
    .email()
    .max(191)
    .transform((v) => v.toLowerCase()),
  phone: field(40),
  quantity: z.coerce.number().int().min(2).max(1000),
  eventDate: day,
  notes: field(3000),
  consent: z.literal('yes'),
  website: z.literal(''),
});
const quoteSchema = z.object({
  revision: z.coerce.number().int().min(0),
  unitPrice: z.coerce.number().int().min(1).max(1_000_000),
  readyBy: day,
  quoteNotes: z.string().trim().max(3000),
});
const acceptSchema = z.object({
  revision: z.number().int().positive(),
  consent: z.literal(true),
  street: field(180),
  city: field(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/),
});

export function eventReviewPath(id: string) {
  return '/event-orders/' + id + '/' + orderToken('event-review:' + id);
}
export function eventLinkMatches(id: string, token: string) {
  return (
    /^[a-z0-9]{10,60}$/.test(id) &&
    /^[0-9a-f]{64}$/.test(token) &&
    secureEqual(orderToken('event-review:' + id), token)
  );
}

async function picture(entry: FormDataEntryValue | null) {
  if (entry === null || (entry instanceof File && !entry.size)) return null;
  if (
    !(entry instanceof File) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(entry.type) ||
    entry.size > 5 * 1024 * 1024
  )
    throw new HttpError(
      400,
      'Користи JPG, PNG или WebP до 5 MB. / Use JPG, PNG or WebP up to 5 MB.',
    );
  try {
    const source = Buffer.from(await entry.arrayBuffer());
    if (!isAllowedRaster(source)) throw new Error('Expected a still raster image');
    const img = sharp(source, {
      limitInputPixels: 24_000_000,
      failOn: 'warning',
    });
    const meta = await img.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      entry.type !== 'image/' + meta.format ||
      (meta.pages ?? 1) > 1
    )
      throw new Error();
    for (const [width, quality] of [
      [1400, 86],
      [1000, 78],
      [720, 72],
    ]) {
      const preview = await img
        .clone()
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      if (preview.length <= 240 * 1024)
        return { source, format: meta.format!, preview: new Uint8Array(preview) };
    }
    throw new Error('Oversized proof');
  } catch {
    throw new HttpError(400, 'Невалидна или преголема слика. / Invalid or oversized image.');
  }
}

async function namesText(form: FormData) {
  const typed = z
    .string()
    .max(32000)
    .parse(form.get('names') ?? '')
    .trim();
  const file = form.get('namesFile');
  let text = typed;
  if (file instanceof File && file.size) {
    if (typed || !/\.(txt|csv)$/i.test(file.name) || file.size > 64000)
      throw new HttpError(400, 'Use one names list: pasted text or one UTF-8 TXT/CSV up to 64 KB.');
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()).trim();
    } catch {
      throw new HttpError(400, 'The names file must be UTF-8 text.');
    }
  }
  if (text.length > 32000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw new HttpError(400, 'Use a plain text names list up to 32,000 characters.');
  return text || null;
}

export async function requestEventOrder(form: FormData, userId?: string) {
  const details = detailsSchema.parse(Object.fromEntries(form));
  if (details.eventDate < studioDay())
    throw new HttpError(400, 'Избери денес или иден датум. / Choose today or a future event date.');
  const [logo, names] = await Promise.all([picture(form.get('logo')), namesText(form)]);
  const fingerprint = hash(
    JSON.stringify([
      details,
      userId ?? '',
      names,
      logo && createHash('sha256').update(logo.source).digest('hex'),
    ]),
  );
  return serializable(async (tx) => {
    const existing = await tx.eventOrderRequest.findUnique({
      where: { requestKey: details.requestKey },
      select: { id: true, fingerprint: true },
    });
    if (existing) {
      if (fingerprint !== existing.fingerprint)
        throw new HttpError(409, 'This request key belongs to different details.');
      return existing.id;
    }
    const product = details.productId
      ? await tx.product.findFirst({
          where: {
            ...storefrontProductWhere,
            id: details.productId,
            inventoryMode: { not: 'OUT_OF_STOCK' },
          },
          select: { id: true, name: true },
        })
      : null;
    if (details.productId && !product)
      throw new HttpError(400, 'The selected product is unavailable.');
    const { consent, website, productId, ...fields } = details;
    const r = await tx.eventOrderRequest.create({
      data: {
        ...fields,
        userId,
        fingerprint,
        names,
        productId: product?.id,
        productName: product?.name || 'Custom event design',
        ...(logo && { assets: { create: { kind: 'logo', data: logo.preview } } }),
      },
      select: { id: true },
    });
    if (logo) {
      // Preserve the supplied production logo byte for byte; keep each DB packet small.
      const chunkSize = 240 * 1024;
      for (let offset = 0; offset < logo.source.length; offset += chunkSize) {
        const position = String(offset / chunkSize).padStart(3, '0');
        await tx.eventOrderAsset.create({
          data: {
            requestId: r.id,
            kind: 'src-' + logo.format + '-' + position,
            data: new Uint8Array(logo.source.subarray(offset, offset + chunkSize)),
          },
          select: { requestId: true },
        });
      }
    }
    return r.id;
  });
}

async function eventDelivery(tx: Prisma.TransactionClient, subtotal: number) {
  const methods = await tx.shippingMethod.findMany({
    where: { country: 'MK', enabled: true, kind: { in: ['STANDARD', 'FREE'] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const standard = methods.find((m) => m.kind === 'STANDARD');
  const free = methods.find(
    (m) => m.kind === 'FREE' && (m.freeThreshold === null || subtotal >= m.freeThreshold),
  );
  const method = free || standard;
  if (!method) throw new HttpError(409, 'No eligible delivery method for this quote.');
  const fee =
    method.kind === 'FREE' || (method.freeThreshold !== null && subtotal >= method.freeThreshold)
      ? 0
      : method.price;
  return { shippingId: method.id, shippingName: method.name, shipping: fee };
}

export async function publishEventQuote(id: string, form: FormData) {
  const input = quoteSchema.parse(Object.fromEntries(form));
  const sample = await picture(form.get('sample'));
  return serializable(async (tx) => {
    const r = await tx.eventOrderRequest.findUnique({
      where: { id },
      select: { status: true, revision: true, eventDate: true, quantity: true },
    });
    if (!r) throw new HttpError(404, 'Request unavailable.');
    if (r.status === 'APPROVED' || r.revision !== input.revision)
      throw new HttpError(409, 'This request changed. Reload before issuing a quote.');
    if (input.readyBy < studioDay() || input.readyBy > r.eventDate)
      throw new HttpError(
        400,
        'Choose a production deadline between today and the requested event.',
      );
    if (!sample && !(await tx.eventOrderAsset.count({ where: { requestId: id, kind: 'sample' } })))
      throw new HttpError(400, 'Upload a sample image for the customer to approve.');
    const delivery = await eventDelivery(tx, input.unitPrice * r.quantity);
    const changed = await tx.eventOrderRequest.updateMany({
      where: { id, revision: input.revision, status: { in: ['NEW', 'QUOTE_SENT'] } },
      data: {
        status: 'QUOTE_SENT',
        revision: { increment: 1 },
        unitPrice: input.unitPrice,
        readyBy: input.readyBy,
        quoteNotes: input.quoteNotes,
        ...delivery,
      },
    });
    if (!changed.count) throw new HttpError(409, 'This request has changed. Reload to review it.');
    if (sample)
      await tx.eventOrderAsset.upsert({
        where: { requestId_kind: { requestId: id, kind: 'sample' } },
        create: { requestId: id, kind: 'sample', data: sample.preview },
        update: { data: sample.preview },
      });
    return { revision: input.revision + 1 };
  });
}

export async function acceptEventQuote(id: string, token: string, raw: unknown) {
  if (!eventLinkMatches(id, token)) throw new HttpError(404, 'Quote unavailable.');
  const input = acceptSchema.parse(raw);
  return serializable(async (tx) => {
    const r = await tx.eventOrderRequest.findUnique({
      where: { id },
      include: { order: { select: { number: true, entryFingerprint: true } } },
    });
    if (!r) throw new HttpError(404, 'Quote unavailable.');
    const orderKey = 'event:' + id;
    const accessToken = orderToken(orderKey);
    const approvalFingerprint = hash(JSON.stringify(input));
    if (r.order) {
      if (r.order.entryFingerprint !== approvalFingerprint)
        throw new HttpError(409, 'This quote already has a confirmed order.');
      return { number: r.order.number, token: accessToken };
    }
    if (
      r.status !== 'QUOTE_SENT' ||
      r.unitPrice === null ||
      r.shipping === null ||
      !r.shippingId ||
      !r.shippingName ||
      r.revision !== input.revision
    )
      throw new HttpError(
        409,
        'Понудата е променета. Обнови ја страницата. / The quote changed. Reload before approving.',
      );
    if (!r.readyBy || r.readyBy < studioDay())
      throw new HttpError(
        409,
        'Побарај нов рок од студиото. / Ask the studio for a new production date.',
      );
    const subtotal = r.quantity * r.unitPrice;
    const delivery = await eventDelivery(tx, subtotal);
    if (delivery.shipping !== r.shipping || delivery.shippingId !== r.shippingId)
      throw new HttpError(409, 'Delivery changed. Ask the studio to refresh the quote.');
    const [firstName, ...rest] = r.name.split(/\s+/);
    const customerData = { firstName, lastName: rest.join(' '), email: r.email, phone: r.phone };
    const account = r.userId
      ? await tx.user.findUnique({ where: { id: r.userId }, select: { id: true } })
      : null;
    let customer = account
      ? await tx.customer.findUnique({ where: { userId: account.id } })
      : await tx.customer.findFirst({ where: { email: r.email, phone: r.phone, userId: null } });
    customer ??= await tx.customer.create({ data: { ...customerData, userId: account?.id } });
    const year = Number(studioDay().slice(0, 4));
    const sequence = await tx.orderSequence.upsert({
      where: { year },
      create: { year, value: 1 },
      update: { value: { increment: 1 } },
    });
    const catalogReference = r.productId
      ? await tx.product.findUnique({ where: { id: r.productId }, select: { id: true, sku: true } })
      : null;
    const rewards = await rewardsSettings(tx);
    const number = 'GX-' + year + '-' + String(sequence.value).padStart(6, '0');
    // An approved proof is a bespoke production run. Its catalog reference does not reserve finished retail stock.
    const order = await tx.order.create({
      data: {
        ...customerData,
        customerId: customer.id,
        street: input.street,
        city: input.city,
        postalCode: input.postalCode,
        source: 'ONLINE',
        status: 'CONFIRMED',
        idempotencyKey: orderKey,
        entryFingerprint: approvalFingerprint,
        number,
        accessTokenHash: hash(accessToken),
        subtotal,
        shipping: r.shipping,
        total: subtotal + r.shipping,
        shippingName: r.shippingName,
        shippingMethodId: r.shippingId,
        rewardsUserId: account?.id,
        pointsEarned: account && rewards.enabled ? earnedPoints(subtotal, rewards.earnEveryMkd) : 0,
        earnEveryMkd: rewards.earnEveryMkd,
        internalNotes: 'Approved event sample · ' + r.readyBy,
        items: {
          create: {
            name: r.productName,
            sku: catalogReference?.sku ?? 'EVENT-' + id,
            productId: catalogReference?.id,
            stockDeducted: false,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            subtotal,
            madeToOrder: true,
          },
        },
        history: {
          create: {
            status: 'CONFIRMED',
            note: 'Event sample and quote approved. Cash on delivery.',
          },
        },
      },
      select: { id: true },
    });
    const claimed = await tx.eventOrderRequest.updateMany({
      where: { id, orderId: null, revision: input.revision, status: 'QUOTE_SENT' },
      data: { orderId: order.id, status: 'APPROVED' },
    });
    if (!claimed.count) throw new HttpError(409, 'The quote changed. Reload the page.');
    return { number, token: accessToken };
  });
}

export function privateImage(data: Uint8Array) {
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

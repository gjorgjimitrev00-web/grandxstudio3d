import { Prisma, ReviewStatus } from '@prisma/client';
import sharp from 'sharp';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from './db';
import { HttpError, currentUser, hash, secureEqual } from './security';
import { storefrontProductWhere } from './catalog-visibility';
import { isAllowedRaster } from './still-raster';

export const reviewMaxPhotoBytes = 5 * 1024 * 1024;
const reviewFields = z.object({
  productId: z.string().trim().min(1).max(191),
  rating: z
    .string()
    .regex(/^[1-5]$/)
    .transform(Number),
  body: z.string().trim().min(3).max(1500),
  consent: z.literal('yes'),
});

type BuyerOrder = { number: string; accessTokenHash: string; customer: { userId: string | null } };

export function isReviewBuyer(order: BuyerOrder, token?: string, userId?: string) {
  return Boolean(
    (token && secureEqual(hash(token), order.accessTokenHash)) ||
    (userId && order.customer.userId === userId),
  );
}

export async function deliveredReviewOrder(number: string) {
  const order = await db.order.findUnique({
    where: { number },
    select: {
      id: true,
      number: true,
      status: true,
      accessTokenHash: true,
      customer: { select: { userId: true } },
    },
  });
  const [jar, user] = await Promise.all([cookies(), currentUser()]);
  if (!order || !isReviewBuyer(order, jar.get(`gx-order-${number}`)?.value, user?.id))
    throw new HttpError(404, 'Order not found.');
  if (order.status !== 'DELIVERED') throw new HttpError(409, 'Reviews open after delivery.');
  return order;
}

export async function reviewPhoto(file: File) {
  if (file.size < 1 || file.size > reviewMaxPhotoBytes)
    throw new HttpError(400, 'Use a JPEG, PNG or WebP photo up to 5 MB.');
  try {
    const input = Buffer.from(await file.arrayBuffer());
    if (!isAllowedRaster(input)) throw new Error();
    const image = sharp(input, { limitInputPixels: 24_000_000, failOn: 'error' });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages ?? 1) !== 1)
      throw new Error();
    // Sharp re-encodes a single raster and removes embedded metadata and filenames.
    return await image
      .autoOrient()
      .resize(960, 960, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    throw new HttpError(400, 'Invalid photo. Use a still JPEG, PNG or WebP image.');
  }
}

export async function submitReview(orderId: string, form: FormData) {
  const fields = reviewFields.parse(Object.fromEntries(form));
  const file = form.get('photo');
  if (typeof file === 'string') throw new HttpError(400, 'Invalid photo.');
  const photo = file && file.size > 0 ? await reviewPhoto(file) : null;
  try {
    return await db.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM \`Order\` WHERE id=${orderId} FOR UPDATE
      `;
      if (order?.status !== 'DELIVERED') throw new HttpError(409, 'Reviews open after delivery.');
      const purchased = await tx.orderItem.findFirst({
        where: { orderId, productId: fields.productId, rewardGift: false },
        select: { id: true },
      });
      if (!purchased) throw new HttpError(400, 'Select a product purchased in this order.');
      return tx.productReview.create({
        data: {
          orderId,
          productId: fields.productId,
          rating: fields.rating,
          body: fields.body,
          consentAt: new Date(),
          ...(photo && { photo: { create: { data: new Uint8Array(photo) } } }),
        },
        select: { id: true, status: true },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new HttpError(409, 'You have already reviewed this product for this order.');
    throw error;
  }
}

export const publicReviewWhere = {
  status: ReviewStatus.APPROVED,
  product: storefrontProductWhere,
  order: { status: 'DELIVERED' },
} satisfies Prisma.ProductReviewWhereInput;

export async function serveReviewPhoto(reviewId: string, admin: boolean) {
  const row = await db.productReviewPhoto.findFirst({
    where: { reviewId, ...(!admin && { review: publicReviewWhere }) },
    select: { data: true },
  });
  if (!row) throw new HttpError(404, 'Photo not found.');
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(row.data.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

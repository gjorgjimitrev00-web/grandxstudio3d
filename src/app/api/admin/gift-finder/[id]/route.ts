import { z } from 'zod';
import { db } from '@/lib/db';
import { occasions, recipients, type Occasion, type Recipient } from '@/lib/gift-finder';
import { errorResponse, HttpError, originCheck, requireAdmin, readJson } from '@/lib/security';
const tags = z
  .object({
    occasions: z
      .array(z.enum(Object.keys(occasions) as [Occasion, ...Occasion[]]))
      .max(Object.keys(occasions).length),
    recipients: z
      .array(z.enum(Object.keys(recipients) as [Recipient, ...Recipient[]]))
      .max(Object.keys(recipients).length),
  })
  .strict();
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    originCheck(request);
    await requireAdmin();
    const { id: productId } = await params;
    const { expected, next } = z
      .object({ expected: tags.nullable(), next: tags.nullable() })
      .strict()
      .parse(await readJson(request));
    await db.$transaction(async (tx) => {
      if (!(await tx.product.findUnique({ where: { id: productId }, select: { id: true } })))
        throw new HttpError(404, 'Product not found.');
      if (expected) {
        const where = {
          productId,
          occasions: { equals: expected.occasions },
          recipients: { equals: expected.recipients },
        };
        const result = next
          ? await tx.giftProfile.updateMany({ where, data: next })
          : await tx.giftProfile.deleteMany({ where });
        if (!result.count)
          throw new HttpError(409, 'The gift tags changed. Refresh before saving.');
      } else if (next) {
        if (
          !(
            await tx.giftProfile.createMany({
              data: [{ productId, ...next }],
              skipDuplicates: true,
            })
          ).count
        )
          throw new HttpError(409, 'The gift tags changed. Refresh before saving.');
      }
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

import { ReviewStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, originCheck, readJson, requireAdmin } from '@/lib/security';

const decision = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  expectedStatus: z.enum(ReviewStatus),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    originCheck(request);
    await requireAdmin();
    const { id } = await context.params;
    const { status, expectedStatus } = decision.parse(await readJson(request));
    const changed = await db.productReview.updateMany({
      where: { id, status: expectedStatus },
      data: { status },
    });
    if (!changed.count) {
      const current = await db.productReview.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!current) throw new HttpError(404, 'Review not found.');
      if (current.status !== status)
        throw new HttpError(409, 'Review changed. Refresh before moderating.');
    }
    return Response.json({ status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

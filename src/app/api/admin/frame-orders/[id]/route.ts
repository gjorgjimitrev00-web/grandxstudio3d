import { RequestStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  errorResponse,
  HttpError,
  originCheck,
  rateLimit,
  readJson,
  requireAdmin,
} from '@/lib/security';

export const runtime = 'nodejs';

const update = z.object({ status: z.enum(RequestStatus), expectedStatus: z.enum(RequestStatus) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    originCheck(request);
    const user = await requireAdmin();
    await rateLimit(request, 'frame-order-status', 120, 900, user.id);
    const { status, expectedStatus } = update.parse(await readJson(request));
    const { id } = await context.params;
    const changed = await db.frameOrder.updateMany({
      where: { id, status: expectedStatus },
      data: { status },
    });
    if (!changed.count) {
      const order = await db.frameOrder.findUnique({ where: { id }, select: { status: true } });
      if (!order) throw new HttpError(404, 'Frame order not found.');
      if (order.status !== status)
        throw new HttpError(409, 'This order was updated elsewhere. Refresh and try again.');
    }
    return Response.json({ ok: true, status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

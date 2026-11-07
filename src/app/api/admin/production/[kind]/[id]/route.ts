import { z } from 'zod';
import { db } from '@/lib/db';
import { openOrders, openRequests, planSchema } from '@/lib/production';
import {
  errorResponse,
  HttpError,
  originCheck,
  rateLimit,
  readJson,
  requireAdmin,
} from '@/lib/security';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    originCheck(request);
    const admin = await requireAdmin();
    await rateLimit(request, 'production-plan', 180, 900, admin.id);
    const { kind, id } = await params;
    const { expected, plan } = z
      .object({ expected: planSchema, plan: planSchema })
      .strict()
      .parse(await readJson(request));
    const match = { id, ...expected };
    let changed;
    if (kind === 'order')
      changed = await db.order.updateMany({
        where: { ...match, status: { in: [...openOrders] } },
        data: plan,
      });
    else if (kind === 'custom')
      changed = await db.customPrintRequest.updateMany({
        where: { ...match, status: { in: [...openRequests] } },
        data: plan,
      });
    else if (kind === 'frame')
      changed = await db.frameOrder.updateMany({
        where: { ...match, status: { in: [...openRequests] } },
        data: plan,
      });
    else throw new HttpError(404, 'Unknown job type.');
    if (!changed.count)
      throw new HttpError(409, 'This job changed or left the queue. Reload before editing it.');
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

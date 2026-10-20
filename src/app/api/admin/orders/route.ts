import { createManualOrder } from '@/lib/manual-orders';
import { errorResponse, originCheck, rateLimit, readJson, requireAdmin } from '@/lib/security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    originCheck(request);
    const actor = await requireAdmin();
    await rateLimit(request, 'manual-order', 120, 3600, actor.id);
    const order = await createManualOrder(await readJson(request), actor.id);
    return Response.json(
      { id: order.id, number: order.number },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

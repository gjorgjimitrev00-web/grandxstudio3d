import { framePriceUpdate, saveFramePrices } from '@/lib/frame-pricing';
import { errorResponse, originCheck, readJson, requireAdmin } from '@/lib/security';

export async function PUT(request: Request) {
  try {
    originCheck(request);
    await requireAdmin();
    const revision = await saveFramePrices(framePriceUpdate.parse(await readJson(request)));
    return Response.json({ revision }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

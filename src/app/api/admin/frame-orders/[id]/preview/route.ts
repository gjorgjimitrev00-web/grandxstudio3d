import { frameAssetResponse } from '@/lib/frame-orders';
import { errorResponse, requireAdmin } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    return await frameAssetResponse((await context.params).id, 'PREVIEW');
  } catch (error) {
    return errorResponse(error);
  }
}

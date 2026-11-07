import { serveReviewPhoto } from '@/lib/product-reviews';
import { errorResponse, requireAdmin } from '@/lib/security';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    return await serveReviewPhoto((await context.params).id, true);
  } catch (error) {
    return errorResponse(error);
  }
}

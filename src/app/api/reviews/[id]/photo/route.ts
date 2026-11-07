import { serveReviewPhoto } from '@/lib/product-reviews';
import { errorResponse } from '@/lib/security';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await serveReviewPhoto((await context.params).id, false);
  } catch (error) {
    return errorResponse(error);
  }
}

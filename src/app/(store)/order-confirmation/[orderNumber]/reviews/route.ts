import { deliveredReviewOrder, reviewMaxPhotoBytes, submitReview } from '@/lib/product-reviews';
import { errorResponse, limitedForm, originCheck, rateLimit } from '@/lib/security';

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    originCheck(request);
    const order = await deliveredReviewOrder((await context.params).orderNumber);
    await rateLimit(request, 'product-review', 24, 900, order.id);
    const form = await limitedForm(request, reviewMaxPhotoBytes + 32 * 1024);
    const result = await submitReview(order.id, form);
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

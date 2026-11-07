import { currentUser, errorResponse, limitedForm, originCheck, rateLimit } from '@/lib/security';
import { eventReviewPath, requestEventOrder } from '@/lib/event-orders';

export async function POST(request: Request) {
  try {
    originCheck(request);
    await rateLimit(request, 'event-requests', 12, 3600);
    const user = await currentUser();
    const form = await limitedForm(request, 6 * 1024 * 1024);
    const id = await requestEventOrder(form, user?.id);
    return Response.json(
      { url: eventReviewPath(id) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

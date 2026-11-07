import { publishEventQuote } from '@/lib/event-orders';
import { errorResponse, limitedForm, originCheck, requireAdmin } from '@/lib/security';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    originCheck(request);
    await requireAdmin();
    return Response.json(
      await publishEventQuote((await params).id, await limitedForm(request, 6 * 1024 * 1024)),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

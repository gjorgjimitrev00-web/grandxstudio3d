import { FramePriceChanged, submitFrameOrder } from '@/lib/frame-orders';
import { errorResponse, originCheck } from '@/lib/security';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    originCheck(request);
    const { result, created } = await submitFrameOrder(request);
    return Response.json(result, {
      status: created ? 201 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof FramePriceChanged) {
      return Response.json(
        { error: error.message, code: 'FRAME_PRICE_CHANGED', unitPrice: error.unitPrice },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return errorResponse(error);
  }
}

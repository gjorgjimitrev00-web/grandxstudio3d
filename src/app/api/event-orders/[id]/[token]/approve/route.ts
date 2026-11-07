import { cookies } from 'next/headers';
import { acceptEventQuote } from '@/lib/event-orders';
import { errorResponse, originCheck, readJson, rateLimit } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  try {
    originCheck(request);
    await rateLimit(request, 'event-approve', 30);
    const { id, token } = await params;
    const order = await acceptEventQuote(id, token, await readJson(request));
    (await cookies()).set('gx-order-' + order.number, order.token, {
      httpOnly: true,
      path: '/order-confirmation/' + order.number,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 86400,
    });
    return Response.json({ number: order.number }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

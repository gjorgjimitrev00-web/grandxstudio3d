import { db } from '@/lib/db';
import { eventLinkMatches, privateImage } from '@/lib/event-orders';
import { errorResponse, HttpError } from '@/lib/security';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  try {
    const { id, token } = await params;
    if (!eventLinkMatches(id, token)) throw new HttpError(404, 'Sample unavailable.');
    const revision = Number(new URL(request.url).searchParams.get('v'));
    if (!Number.isSafeInteger(revision) || revision < 1 || revision > 2_147_483_647)
      throw new HttpError(404, 'Sample unavailable.');
    const photo = await db.eventOrderAsset.findFirst({
      where: {
        requestId: id,
        kind: 'sample',
        request: { revision, status: { in: ['QUOTE_SENT', 'APPROVED'] } },
      },
      select: { data: true },
    });
    if (!photo) throw new HttpError(404, 'Sample unavailable.');
    return privateImage(photo.data);
  } catch (error) {
    return errorResponse(error);
  }
}

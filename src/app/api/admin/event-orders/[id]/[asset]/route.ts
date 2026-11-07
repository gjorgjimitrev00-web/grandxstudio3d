import { db } from '@/lib/db';
import { privateImage } from '@/lib/event-orders';
import { errorResponse, HttpError, requireAdmin } from '@/lib/security';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; asset: string }> },
) {
  try {
    await requireAdmin();
    const { id, asset } = await params;
    if (asset === 'original-logo') {
      const parts = await db.eventOrderAsset.findMany({
        where: { requestId: id, kind: { startsWith: 'src-' } },
        orderBy: { kind: 'asc' },
        select: { kind: true, data: true },
      });
      if (!parts.length) throw new HttpError(404, 'File unavailable.');
      const format = parts[0].kind.split('-')[1];
      if (
        !['jpeg', 'png', 'webp'].includes(format) ||
        parts.some((p, i) => p.kind !== 'src-' + format + '-' + String(i).padStart(3, '0'))
      )
        throw new HttpError(500, 'Stored logo incomplete.');
      return new Response(new Uint8Array(Buffer.concat(parts.map((p) => p.data))), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'attachment; filename="event-logo.' + format + '"',
        },
      });
    }
    if (!['logo', 'sample'].includes(asset)) throw new HttpError(404, 'File unavailable.');
    const file = await db.eventOrderAsset.findUnique({
      where: { requestId_kind: { requestId: id, kind: asset } },
      select: { data: true },
    });
    if (!file) throw new HttpError(404, 'File unavailable.');
    return privateImage(file.data);
  } catch (error) {
    return errorResponse(error);
  }
}

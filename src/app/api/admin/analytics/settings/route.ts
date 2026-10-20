import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, originCheck, readJson, requireAdmin } from '@/lib/security';
export async function PUT(request: Request) {
  try {
    originCheck(request);
    await requireAdmin();
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await readJson(request));
    await db.storeSetting.upsert({
      where: { key: 'analyticsEnabled' },
      create: { key: 'analyticsEnabled', value: String(enabled) },
      update: { value: String(enabled) },
    });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

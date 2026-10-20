import { currentUser, originCheck, rateLimit, readLimited, secret } from '@/lib/security';
import { getSettings } from '@/lib/settings';
import { visitIdentity } from '@/lib/visitor-rules';
import { recordVisitor } from '@/lib/visitors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const empty = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  try {
    originCheck(request);
    await readLimited(request, 256);
    const identity = visitIdentity(request.headers, secret());
    if (!identity) return empty();
    // A separate global cap still applies even if a caller spoofs analytics-only
    // forwarded headers. These headers never grant access to private resources.
    await rateLimit(request, 'visits-global', 10000, 900, 'all');
    await rateLimit(request, 'visits-browser', 60, 900, identity.visitorHash);
    const [user, settings] = await Promise.all([currentUser(), getSettings()]);
    if (user?.role === 'ADMIN' || settings.analyticsEnabled === 'false') return empty();
    await recordVisitor(identity);
  } catch {
    // Optional measurement must never break shopping or disclose visitor data.
  }
  return empty();
}

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { siteUrl } from './utils';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new HttpError(503, 'Store authentication is not configured.');
  return s;
}
export const secureEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const orderToken = (key: string) =>
  createHmac('sha256', secret()).update(`order:${key}`).digest('hex');
export function originCheck(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(siteUrl()).origin)
    throw new HttpError(403, 'Invalid request origin.');
}
export async function readJson(request: Request) {
  const raw = await readLimited(request, 256 * 1024);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export async function readLimited(request: Request, max: number) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > max) throw new HttpError(413, 'File or request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      throw new HttpError(413, 'File or request is too large.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function limitedForm(request: Request, max: number) {
  const body = await readLimited(request, max);
  return new Response(new Uint8Array(body), {
    headers: { 'content-type': request.headers.get('content-type') || '' },
  }).formData();
}
export async function rateLimit(
  request: Request,
  scope: string,
  limit = 30,
  seconds = 900,
  identity = '',
) {
  const ip =
    process.env.TRUST_PROXY === 'true'
      ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      : 'shared';
  const now = Date.now();
  const bucket = Math.floor(now / (seconds * 1000));
  const key = hash(`${scope}:${identity || ip}:${bucket}`);
  const r = await db.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((bucket + 1) * seconds * 1000) },
    update: { count: { increment: 1 } },
  });
  if (r.count > limit) throw new HttpError(429, 'Too many requests. Please try again later.');
  if (Math.random() < 0.01)
    await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
}
const SESSION = 'gx-session';
export async function currentUser() {
  const token = (await cookies()).get(SESSION)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Please sign in.');
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Administrator access required.');
  return user;
}
export async function createSession(userId: string) {
  secret();
  const token = randomBytes(32).toString('hex');
  const jar = await cookies();
  const old = jar.get(SESSION)?.value;
  if (old) await db.session.deleteMany({ where: { tokenHash: hash(old) } });
  await db.session.create({
    data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 86400000) },
  });
  jar.set(SESSION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 86400,
  });
}
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  jar.delete(SESSION);
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .slice(0, 5)
          .join('; '),
      },
      { status: 400 },
    );
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002')
      return Response.json({ error: 'This email, SKU, or slug already exists.' }, { status: 409 });
    if (error.code === 'P2025')
      return Response.json({ error: 'Record not found.' }, { status: 404 });
    if (error.code === 'P2003')
      return Response.json({ error: 'This record is still in use.' }, { status: 409 });
  }
  console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
  return Response.json(
    { error: 'The store could not complete this request. Please try again.' },
    { status: 500 },
  );
}

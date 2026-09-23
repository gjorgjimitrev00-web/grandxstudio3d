import { z } from 'zod';
import { compare, hash as hashPassword } from 'bcryptjs';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import {
  errorResponse,
  originCheck,
  readJson,
  limitedForm,
  rateLimit,
  requireAdmin,
  requireUser,
  currentUser,
  createSession,
  destroySession,
  HttpError,
  hash,
} from '@/lib/security';
import { email, password, text, optionalText, cartSchema, customSchema } from '@/lib/validation';
import { createOrder, quoteCart } from '@/lib/checkout';
import { adminRequest } from '@/lib/admin';
import { storePrivateFile, deleteFile, getFile } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    const route = path.join('/');
    const method = request.method;
    if (method !== 'GET') originCheck(request);
    if (path[0] === 'catalog' && path.length === 2 && method === 'GET') {
      const product = await db.product.findFirst({
        where: { id: path[1], published: true },
        include: {
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
          options: { include: { values: true } },
          variants: { include: { values: { include: { value: true } } } },
        },
      });
      if (!product) throw new HttpError(404, 'Product not found.');
      return Response.json(product, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (path[0] === 'admin') {
      await requireAdmin();
      const result = await adminRequest(request, path.slice(1));
      return result instanceof Response
        ? result
        : Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (route === 'auth/login' && method === 'POST') {
      const input = z
        .object({ email, password: z.string().min(1).max(72), admin: z.boolean().optional() })
        .parse(await readJson(request));
      await rateLimit(request, 'login-global', 150);
      await rateLimit(request, 'login', 8, 900, input.email);
      const user = await db.user.findUnique({ where: { email: input.email } });
      const valid = await compare(
        input.password,
        user?.passwordHash || '$2b$12$V9EG9ToPS98UJnbXS.X64.R3AnEAG6rnq05PxIRVU7SIh68ohms36',
      );
      if (!user || !valid || (input.admin && user.role !== 'ADMIN'))
        throw new HttpError(401, 'Invalid email or password.');
      await createSession(user.id);
      return Response.json({ ok: true, role: user.role });
    }
    if (route === 'auth/register' && method === 'POST') {
      await rateLimit(request, 'register', 30, 3600);
      const input = z.object({ name: text(150), email, password }).parse(await readJson(request));
      const user = await db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password, 12),
        },
      });
      await createSession(user.id);
      return Response.json({ ok: true });
    }
    if (route === 'auth/logout' && method === 'POST') {
      await destroySession();
      return Response.json({ ok: true });
    }
    if (route === 'account/password' && method === 'POST') {
      const user = await requireUser();
      await rateLimit(request, 'password', 8, 900, user.id);
      const input = z
        .object({ currentPassword: z.string().max(72), newPassword: password })
        .parse(await readJson(request));
      const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!(await compare(input.currentPassword, record.passwordHash)))
        throw new HttpError(400, 'Current password is incorrect.');
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(input.newPassword, 12) },
        }),
        db.session.deleteMany({ where: { userId: user.id } }),
      ]);
      await createSession(user.id);
      return Response.json({ ok: true });
    }
    if (route === 'account/profile' && method === 'PUT') {
      const user = await requireUser();
      const input = z
        .object({
          firstName: text(100),
          lastName: text(100),
          phone: text(30),
          street: text(250),
          city: text(100),
          postalCode: z.string().regex(/^\d{4}$/),
        })
        .parse(await readJson(request));
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { name: `${input.firstName} ${input.lastName}` },
        });
        const { street, city, postalCode, ...profile } = input;
        const customer = await tx.customer.upsert({
          where: { userId: user.id },
          create: { ...profile, email: user.email, userId: user.id },
          update: profile,
        });
        await tx.address.deleteMany({ where: { customerId: customer.id } });
        await tx.address.create({
          data: { customerId: customer.id, street, city, postalCode, country: 'MK' },
        });
      });
      return Response.json({ ok: true });
    }
    if (route === 'checkout/quote' && method === 'POST') {
      await rateLimit(request, 'quote', 300, 900);
      const input = z
        .object({ items: cartSchema, shippingMethodId: text(100) })
        .parse(await readJson(request));
      return Response.json(await quoteCart(db, input.items, input.shippingMethodId), {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (route === 'checkout' && method === 'POST') {
      await rateLimit(request, 'checkout', 100, 3600);
      const input = await readJson(request);
      const user = await currentUser();
      const { order, token } = await createOrder(input, user?.id);
      (await cookies()).set(`gx-order-${order.number}`, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: `/order-confirmation/${order.number}`,
        maxAge: 7 * 86400,
      });
      return Response.json({ number: order.number, url: `/order-confirmation/${order.number}` });
    }
    if (route === 'contact' && method === 'POST') {
      await rateLimit(request, 'contact', 30, 3600);
      const input = z
        .object({
          name: text(150),
          email,
          phone: optionalText(30),
          subject: text(200),
          message: text(10000),
          website: z.string().max(0).optional(),
        })
        .parse(await readJson(request));
      const { website, ...data } = input;
      void website;
      await db.contactMessage.create({ data });
      return Response.json({ ok: true });
    }
    if (route === 'newsletter' && method === 'POST') {
      await rateLimit(request, 'newsletter', 60, 3600);
      const input = z
        .object({ email, website: z.string().max(0).optional() })
        .parse(await readJson(request));
      const token = randomBytes(32).toString('hex');
      await db.newsletterSubscriber.upsert({
        where: { email: input.email },
        create: { email: input.email, unsubscribeHash: hash(token) },
        update: { active: true },
      });
      return Response.json({ ok: true });
    }
    if (route === 'custom-orders' && method === 'POST') {
      await rateLimit(request, 'custom-order', 20, 3600);
      const form = await limitedForm(request, 22 * 1024 * 1024);
      const data = customSchema.parse(Object.fromEntries(form));
      const file = form.get('file');
      const attachment =
        file instanceof File && file.size > 0 ? await storePrivateFile(file) : null;
      const { website, ...fields } = data;
      void website;
      try {
        await db.customPrintRequest.create({
          data: { ...fields, files: attachment ? { create: attachment } : undefined },
        });
      } catch (e) {
        if (attachment) await deleteFile(attachment.key).catch(() => {});
        throw e;
      }
      return Response.json({ ok: true });
    }
    if (
      path[0] === 'media' &&
      method === 'GET' &&
      process.env.MEDIA_DRIVER === 'local' &&
      process.env.NODE_ENV !== 'production'
    ) {
      const key = path.slice(1).join('/');
      if (!key.startsWith('images/')) throw new HttpError(404, 'File not found.');
      return new Response(new Uint8Array(await getFile(key)), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
    throw new HttpError(404, 'Endpoint not found.');
  } catch (error) {
    return errorResponse(error);
  }
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };

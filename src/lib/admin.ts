import { z } from 'zod';
import { db } from './db';
import { productSchema, categorySchema, text, optionalText, amount } from './validation';
import { HttpError, readJson, limitedForm } from './security';
import { optimizeImage, deleteFile, getFile } from './storage';
import { updateOrderStatus } from './checkout';
import { OrderStatus, RequestStatus } from '@prisma/client';
import { defaults } from './settings';
export async function adminRequest(request: Request, parts: string[]) {
  const [resource, id, action, childId] = parts;
  const method = request.method;
  if (resource === 'products') {
    if ((method === 'POST' && !id) || (method === 'PUT' && id && !action)) {
      const input = productSchema.parse(await readJson(request));
      const { categoryIds, specifications, ...data } = input;
      return db.$transaction(async (tx) => {
        if (id) {
          await tx.productCategory.deleteMany({ where: { productId: id } });
          await tx.productSpecification.deleteMany({ where: { productId: id } });
        }
        const nested = {
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
          specifications: { create: specifications.map((s, sortOrder) => ({ ...s, sortOrder })) },
        };
        return id
          ? tx.product.update({ where: { id }, data: { ...data, ...nested } })
          : tx.product.create({ data: { ...data, ...nested } });
      });
    }
    if (method === 'POST' && action === 'duplicate') {
      const p = await db.product.findUnique({
        where: { id },
        include: {
          categories: true,
          specifications: true,
          images: true,
          options: { include: { values: true } },
          variants: { include: { values: true } },
        },
      });
      if (!p) throw new HttpError(404, 'Product not found.');
      return db.$transaction(async (tx) => {
        const {
          id: oldId,
          createdAt,
          updatedAt,
          categories,
          specifications,
          images,
          options,
          variants,
          ...data
        } = p;
        void oldId;
        void createdAt;
        void updatedAt;
        const suffix = crypto.randomUUID().slice(0, 8);
        const clone = await tx.product.create({
          data: {
            ...data,
            name: `${data.name} (copy)`,
            slug: `${data.slug.slice(0, 160)}-${suffix}`,
            sku: `${data.sku.slice(0, 80)}-${suffix}`,
            published: false,
            categories: { create: categories.map((c) => ({ categoryId: c.categoryId })) },
            specifications: {
              create: specifications.map((s) => ({
                label: s.label,
                value: s.value,
                sortOrder: s.sortOrder,
              })),
            },
            images: { create: images.map(({ id, productId, createdAt, ...image }) => image) },
          },
        });
        const valueMap = new Map<string, string>();
        for (const o of options) {
          const created = await tx.productOption.create({
            data: {
              productId: clone.id,
              name: o.name,
              kind: o.kind,
              required: o.required,
              sortOrder: o.sortOrder,
              values: { create: o.values.map((v) => ({ value: v.value, swatch: v.swatch })) },
            },
            include: { values: true },
          });
          for (const v of o.values)
            valueMap.set(v.id, created.values.find((x) => x.value === v.value)!.id);
        }
        for (const v of variants)
          await tx.productVariant.create({
            data: {
              productId: clone.id,
              name: v.name,
              sku: `${v.sku.slice(0, 80)}-${suffix}`,
              price: v.price,
              priceAdjustment: v.priceAdjustment,
              stock: v.stock,
              enabled: v.enabled,
              values: { create: v.values.map((x) => ({ valueId: valueMap.get(x.valueId)! })) },
            },
          });
        return clone;
      });
    }
    if (method === 'DELETE' && id && !action) {
      const active = await db.orderItem.count({
        where: { productId: id, order: { status: { notIn: ['CANCELLED', 'DELIVERED'] } } },
      });
      if (active) throw new HttpError(409, 'Unpublish this product while it has active orders.');
      await db.product.delete({ where: { id } });
      return { ok: true };
    }
    if (action === 'options') {
      if (method === 'PUT' && childId) {
        const input = z
          .object({
            name: text(100),
            required: z.boolean(),
            values: z
              .array(
                z.object({
                  id: z.string().optional(),
                  value: text(100),
                  swatch: z
                    .string()
                    .regex(/^#[0-9a-fA-F]{6}$/)
                    .nullable()
                    .optional(),
                }),
              )
              .max(50),
          })
          .parse(await readJson(request));
        return db.$transaction(async (tx) => {
          const option = await tx.productOption.findFirst({
            where: { id: childId, productId: id },
            include: { values: true },
          });
          if (!option) throw new HttpError(404, 'Option not found.');
          if (option.kind === 'SELECT' && !input.values.length)
            throw new HttpError(400, 'Keep at least one choice.');
          if (option.kind === 'TEXT' && input.values.length)
            throw new HttpError(400, 'Text options do not have choice values.');
          const retained = input.values.flatMap((v) => (v.id ? [v.id] : []));
          if (
            new Set(retained).size !== retained.length ||
            retained.some((valueId) => !option.values.some((v) => v.id === valueId))
          )
            throw new HttpError(400, 'Invalid option value.');
          const removed = option.values.filter((v) => !retained.includes(v.id)).map((v) => v.id);
          if (await tx.variantOptionValue.count({ where: { valueId: { in: removed } } }))
            throw new HttpError(409, 'A removed choice is still used by a variant.');
          await tx.productOptionValue.deleteMany({
            where: { id: { in: removed }, optionId: childId },
          });
          for (const value of input.values) {
            const data = { value: value.value, swatch: value.swatch || null };
            if (value.id) await tx.productOptionValue.update({ where: { id: value.id }, data });
            else await tx.productOptionValue.create({ data: { ...data, optionId: childId } });
          }
          return tx.productOption.update({
            where: { id: childId },
            data: { name: input.name, required: input.required },
          });
        });
      }
      if (method === 'POST') {
        const input = z
          .object({
            name: text(100),
            kind: z.enum(['SELECT', 'TEXT']),
            required: z.boolean(),
            values: z
              .array(
                z.object({
                  value: text(100),
                  swatch: z
                    .string()
                    .regex(/^#[0-9a-fA-F]{6}$/)
                    .optional(),
                }),
              )
              .max(50),
          })
          .parse(await readJson(request));
        if (input.kind === 'SELECT' && !input.values.length)
          throw new HttpError(400, 'Add at least one option value.');
        return db.productOption.create({
          data: {
            productId: id,
            name: input.name,
            kind: input.kind,
            required: input.required,
            values: { create: input.kind === 'TEXT' ? [] : input.values },
          },
        });
      }
      if (method === 'DELETE') {
        const used = await db.variantOptionValue.count({ where: { value: { optionId: childId } } });
        if (used) throw new HttpError(409, 'Remove the associated variants first.');
        await db.productOption.deleteMany({ where: { id: childId, productId: id } });
        return { ok: true };
      }
    }
    if (action === 'variants') {
      if (method === 'POST' || method === 'PUT') {
        const input = z
          .object({
            name: text(150),
            sku: text(100),
            price: amount.nullable(),
            priceAdjustment: z.number().int().min(-100000).max(100000),
            stock: amount,
            enabled: z.boolean(),
            image: z.string().max(2000).default(''),
            valueIds: z.array(z.string()).max(20),
          })
          .parse(await readJson(request));
        const values = await db.productOptionValue.findMany({
          where: { id: { in: input.valueIds }, option: { productId: id } },
        });
        if (
          values.length !== input.valueIds.length ||
          new Set(values.map((v) => v.optionId)).size !== values.length
        )
          throw new HttpError(400, 'Select one value per option from this product.');
        const required = await db.productOption.findMany({
          where: { productId: id, kind: 'SELECT', required: true },
        });
        if (required.some((o) => !values.some((v) => v.optionId === o.id)))
          throw new HttpError(400, 'Select all required option values.');
        if (input.image) {
          const allowed = await db.productImage.findFirst({
            where: { productId: id, url: input.image },
          });
          if (!allowed) throw new HttpError(400, 'Choose an uploaded product image.');
        }
        const { valueIds, ...data } = input;
        return db.$transaction(async (tx) => {
          if (childId) {
            const belongs = await tx.productVariant.findFirst({
              where: { id: childId, productId: id },
            });
            if (!belongs) throw new HttpError(404, 'Variant not found.');
            await tx.variantOptionValue.deleteMany({ where: { variantId: childId } });
          }
          const nested = { values: { create: valueIds.map((valueId) => ({ valueId })) } };
          return childId
            ? tx.productVariant.update({ where: { id: childId }, data: { ...data, ...nested } })
            : tx.productVariant.create({ data: { ...data, productId: id, ...nested } });
        });
      }
      if (method === 'DELETE') {
        if (
          await db.orderItem.count({
            where: { variantId: childId, order: { status: { notIn: ['CANCELLED', 'DELIVERED'] } } },
          })
        )
          throw new HttpError(409, 'Disable variants with active orders.');
        await db.productVariant.deleteMany({ where: { id: childId, productId: id } });
        return { ok: true };
      }
    }
    if (action === 'images') {
      if (method === 'POST') {
        const product = await db.product.findUnique({
          where: { id },
          include: { _count: { select: { images: true } } },
        });
        if (!product) throw new HttpError(404, 'Product not found.');
        const form = await limitedForm(request, 32 * 1024 * 1024);
        const files = form.getAll('files').filter((f) => f instanceof File) as File[];
        if (!files.length || files.length > 3 || product._count.images + files.length > 20)
          throw new HttpError(400, 'Upload 1–3 images at a time, maximum 20 per product.');
        const created = [];
        for (const file of files) {
          const image = await optimizeImage(file);
          try {
            created.push(
              await db.productImage.create({
                data: {
                  ...image,
                  productId: id,
                  altText: product.name,
                  sortOrder: product._count.images + created.length,
                  isPrimary: product._count.images === 0 && created.length === 0,
                },
              }),
            );
          } catch (e) {
            await Promise.allSettled(
              [400, 800, 1600].map((s) => deleteFile(`images/${image.filename}-${s}.webp`)),
            );
            throw e;
          }
        }
        return created;
      }
      if (method === 'PATCH') {
        const images = z
          .array(
            z.object({
              id: z.string(),
              altText: z.string().max(200),
              sortOrder: z.number().int().min(0).max(100),
              isPrimary: z.boolean(),
            }),
          )
          .max(20)
          .parse(await readJson(request));
        const existing = await db.productImage.count({ where: { productId: id } });
        if (
          images.length !== existing ||
          new Set(images.map((i) => i.id)).size !== existing ||
          images.filter((i) => i.isPrimary).length !== 1
        )
          throw new HttpError(400, 'Include all images and choose exactly one primary image.');
        await db.$transaction(async (tx) => {
          for (const i of images) {
            const changed = await tx.productImage.updateMany({
              where: { id: i.id, productId: id },
              data: { altText: i.altText, sortOrder: i.sortOrder, isPrimary: i.isPrimary },
            });
            if (changed.count !== 1) throw new HttpError(400, 'Image does not belong to product.');
          }
        });
        return { ok: true };
      }
      if (method === 'DELETE') {
        const image = await db.productImage.findFirst({ where: { id: childId, productId: id } });
        if (!image) throw new HttpError(404, 'Image not found.');
        await db.$transaction(async (tx) => {
          await tx.productImage.delete({ where: { id: childId } });
          if (image.isPrimary) {
            const first = await tx.productImage.findFirst({
              where: { productId: id },
              orderBy: { sortOrder: 'asc' },
            });
            if (first)
              await tx.productImage.update({ where: { id: first.id }, data: { isPrimary: true } });
          }
        });
        if (!(await db.productImage.count({ where: { filename: image.filename } })))
          await Promise.allSettled(
            [400, 800, 1600].map((s) => deleteFile(`images/${image.filename}-${s}.webp`)),
          );
        return { ok: true };
      }
    }
  }
  if (resource === 'categories') {
    if ((method === 'POST' && !id) || (method === 'PUT' && id && !action)) {
      const data = categorySchema.parse(await readJson(request));
      return id ? db.category.update({ where: { id }, data }) : db.category.create({ data });
    }
    if (method === 'DELETE') {
      if (await db.productCategory.count({ where: { categoryId: id } }))
        throw new HttpError(409, 'Remove products from this category first.');
      await db.category.delete({ where: { id } });
      return { ok: true };
    }
    if (method === 'POST' && action === 'image') {
      const form = await limitedForm(request, 11 * 1024 * 1024);
      const file = form.get('file');
      if (!(file instanceof File)) throw new HttpError(400, 'Choose an image.');
      const image = await optimizeImage(file);
      return db.category.update({ where: { id }, data: { image: image.listingUrl } });
    }
  }
  if (resource === 'orders' && method === 'PATCH') {
    const data = z
      .object({ status: z.enum(OrderStatus), internalNotes: optionalText(10000) })
      .parse(await readJson(request));
    return updateOrderStatus(id, data.status, data.internalNotes);
  }
  if (resource === 'custom-orders' && method === 'PATCH') {
    const data = z
      .object({ status: z.enum(RequestStatus), internalNotes: optionalText(10000) })
      .parse(await readJson(request));
    return db.customPrintRequest.update({ where: { id }, data });
  }
  if (resource === 'files' && method === 'GET') {
    const file = await db.customPrintFile.findUnique({ where: { id } });
    if (!file) throw new HttpError(404, 'File not found.');
    return new Response(new Uint8Array(await getFile(file.key)), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  }
  if (resource === 'messages' && method === 'PATCH') {
    const data = z.object({ read: z.boolean() }).parse(await readJson(request));
    return db.contactMessage.update({ where: { id }, data });
  }
  if (resource === 'newsletter' && method === 'PATCH') {
    const data = z.object({ active: z.boolean() }).parse(await readJson(request));
    return db.newsletterSubscriber.update({ where: { id }, data });
  }
  if (resource === 'settings' && method === 'PUT') {
    const data = z.record(z.string(), z.string().max(20000)).parse(await readJson(request));
    for (const key of Object.keys(data)) {
      if (!Object.hasOwn(defaults, key)) throw new HttpError(400, 'Unknown setting.');
      if (
        ['instagram', 'facebook', 'tiktok', 'logo'].includes(key) &&
        data[key] &&
        !/^https:\/\//.test(data[key])
      )
        throw new HttpError(400, 'Enter an HTTPS URL.');
      if (key === 'currency' && data[key] !== 'MKD')
        throw new HttpError(400, 'MKD is the supported checkout currency.');
    }
    await db.$transaction(
      Object.entries(data).map(([key, value]) =>
        db.storeSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
    return { ok: true };
  }
  if (resource === 'shipping' && (method === 'PUT' || method === 'POST')) {
    const data = z
      .object({
        name: text(100),
        kind: z.enum(['STANDARD', 'FREE', 'PICKUP']),
        price: amount,
        freeThreshold: amount.nullable(),
        enabled: z.boolean(),
      })
      .parse(await readJson(request));
    return id
      ? db.shippingMethod.update({ where: { id }, data })
      : db.shippingMethod.create({ data });
  }
  throw new HttpError(404, 'Endpoint not found.');
}

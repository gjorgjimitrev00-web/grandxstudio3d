import { z } from 'zod';
export const email = z.email().trim().toLowerCase().max(191);
export const password = z
  .string()
  .min(12)
  .max(72)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
export const slug = z
  .string()
  .min(2)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');
export const text = (max = 200) => z.string().trim().min(1).max(max);
export const optionalText = (max = 2000) => z.string().trim().max(max).optional().default('');
export const amount = z.number().int().min(0).max(10000000);
export const cartSchema = z
  .array(
    z.object({
      productId: text(100),
      variantId: z.string().max(100).optional(),
      quantity: z.number().int().min(1).max(99),
      options: z.record(z.string().max(100), z.string().trim().max(200)).default({}),
    }),
  )
  .min(1)
  .max(50);
export const checkoutSchema = z.object({
  items: cartSchema,
  shippingMethodId: text(100),
  firstName: text(100),
  lastName: text(100),
  email,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d ()-]{7,25}$/),
  city: text(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter a four-digit postal code'),
  street: text(250),
  country: z.literal('MK'),
  notes: optionalText(),
  idempotencyKey: z.uuid(),
  acceptTerms: z.literal(true),
});
export const productSchema = z
  .object({
    name: text(150),
    slug,
    sku: text(100),
    shortDescription: text(1000),
    description: text(20000),
    price: amount,
    salePrice: amount.nullable().default(null),
    published: z.boolean(),
    featured: z.boolean(),
    bestseller: z.boolean(),
    isNew: z.boolean(),
    inventoryMode: z.enum(['IN_STOCK', 'MADE_TO_ORDER', 'OUT_OF_STOCK']),
    trackInventory: z.boolean(),
    stock: amount,
    lowStockThreshold: amount,
    seoTitle: optionalText(150),
    seoDescription: optionalText(500),
    categoryIds: z.array(z.string()).max(20),
    specifications: z.array(z.object({ label: text(100), value: text(500) })).max(30),
  })
  .refine(
    (v) => v.salePrice === null || v.salePrice < v.price,
    'Sale price must be below regular price',
  );
export const categorySchema = z.object({
  name: text(100),
  slug,
  description: optionalText(2000),
  sortOrder: z.number().int().min(0).max(999),
  enabled: z.boolean(),
});
export const customSchema = z.object({
  name: text(150),
  email,
  phone: text(30),
  description: text(10000),
  dimensions: optionalText(200),
  color: optionalText(100),
  material: optionalText(100),
  quantity: z.coerce.number().int().min(1).max(1000),
  notes: optionalText(3000),
  website: z.string().max(0).optional(),
});

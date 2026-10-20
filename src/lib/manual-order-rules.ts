import { z } from 'zod';
import { studioDay, studioDayStart, validDay } from './time';

const optional = (max: number) => z.string().trim().max(max).default('');
export const manualOrderSchema = z
  .object({
    idempotencyKey: z.uuid(),
    date: z.string().refine(validDay, 'Choose a valid order date.'),
    status: z.enum(['NEW', 'CONFIRMED', 'DELIVERED']),
    paid: z.boolean(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD_EXTERNAL', 'CASH_ON_DELIVERY', 'OTHER']),
    fulfillment: z.enum(['PICKUP', 'DELIVERY']),
    shipping: z.number().int().min(0).max(1000000),
    adjustStock: z.boolean(),
    firstName: optional(100),
    lastName: optional(100),
    email: z.union([z.literal(''), z.email().max(191)]).default(''),
    phone: optional(40),
    street: optional(250),
    city: optional(100),
    postalCode: z.union([z.literal(''), z.string().regex(/^\d{4}$/)]).default(''),
    internalNotes: optional(5000),
    items: z
      .array(
        z
          .object({
            productId: optional(100),
            variantId: optional(100),
            name: optional(200),
            details: optional(500),
            quantity: z.number().int().min(1).max(999),
            unitPrice: z.number().int().min(0).max(10000000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.paid && input.status !== 'DELIVERED')
      ctx.addIssue({
        code: 'custom',
        path: ['paid'],
        message: 'Only a completed order can be marked paid.',
      });
    if (input.fulfillment === 'PICKUP' && input.shipping !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['shipping'],
        message: 'An in-person handover has no delivery charge.',
      });
    if (input.fulfillment === 'DELIVERY')
      for (const field of ['firstName', 'phone', 'street', 'city'] as const)
        if (!input[field])
          ctx.addIssue({ code: 'custom', path: [field], message: 'Required for delivery.' });
    input.items.forEach((item, index) => {
      if (!item.productId && !item.name)
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'name'],
          message: 'Name the custom item.',
        });
      if (!item.productId && item.variantId)
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'variantId'],
          message: 'A variant requires a product.',
        });
    });
    if (manualTotals(input.items, input.shipping).total > 1000000000)
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'The order total is too large.' });
  });

export function manualTotals(items: { quantity: number; unitPrice: number }[], shipping: number) {
  const subtotal = items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  return { subtotal, shipping, total: subtotal + shipping };
}

export function manualSaleDate(date: string, now = new Date()) {
  if (!validDay(date) || date < '2000-01-01' || date > studioDay(now))
    throw new Error('Choose an order date from 2000 through today, in Europe/Skopje.');
  return studioDayStart(date);
}

export const paymentLabels: Record<string, string> = {
  CASH_ON_DELIVERY: 'Cash on delivery',
  CASH: 'Cash in person',
  BANK_TRANSFER: 'Bank transfer',
  CARD_EXTERNAL: 'Card paid outside the website',
  OTHER: 'Other payment',
};

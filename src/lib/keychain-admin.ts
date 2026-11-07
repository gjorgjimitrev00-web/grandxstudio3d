import { z } from 'zod';
import { HttpError } from './security';
import { serializable } from './checkout';
import {
  colorHex,
  KEYCHAIN_STARTER_ID,
  keychainOptions,
  supportsKeychainColor,
} from './keychain-preview';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const settingsSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    nameOptionId: z.string().min(1).max(100),
    colorOptionId: z.string().min(1).max(100),
    colors: z
      .array(
        z.object({ value: z.string().trim().min(1).max(80), swatch: z.string().regex(colorHex) }),
      )
      .max(30)
      .default([]),
  }),
]);

export async function setKeychainPreview(productId: string, input: unknown) {
  const config = settingsSchema.parse(input);
  return serializable(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new HttpError(404, 'Product not found.');
    const options = await tx.productOption.findMany({
      where: { productId },
      include: { values: true },
    });
    if (!config.enabled) {
      await tx.productOption.updateMany({
        where: { productId, keychainRole: { not: null } },
        data: { keychainRole: null },
      });
      return { ok: true };
    }
    let text = options.find((o) => o.id === config.nameOptionId);
    if (config.nameOptionId === 'new') {
      text = options.find((o) => o.keychainRole === 'NAME');
      if (!text) {
        if (options.some((o) => o.kind === 'TEXT' && o.required))
          throw new HttpError(400, 'Choose the existing required text field.');
        text = await tx.productOption.create({
          data: {
            productId,
            kind: 'TEXT',
            name: 'Име / Name',
            required: true,
            sortOrder: options.length,
          },
          include: { values: true },
        });
      }
    }
    if (!text?.required || text.kind !== 'TEXT')
      throw new HttpError(400, 'Choose a required text option on this product.');
    let color = options.find((o) => o.id === config.colorOptionId);
    if (config.colorOptionId === 'new') {
      color = options.find((o) => o.keychainRole === 'COLOR');
      if (!color) {
        if (options.some(supportsKeychainColor))
          throw new HttpError(400, 'Choose the existing color option.');
        if (
          !config.colors.length ||
          new Set(config.colors.map((c) => c.value.toLocaleLowerCase())).size !==
            config.colors.length
        )
          throw new HttpError(400, 'Add a unique name and hex swatch for each available color.');
        color = await tx.productOption.create({
          data: {
            productId,
            kind: 'SELECT',
            name: 'Боја / Color',
            sortOrder: options.length + 1,
            required: true,
            values: { create: config.colors },
          },
          include: { values: true },
        });
      }
    }
    if (!color || !supportsKeychainColor(color))
      throw new HttpError(400, 'Choose a required color option with a swatch for every value.');
    await tx.productOption.updateMany({
      where: { productId, keychainRole: { not: null } },
      data: { keychainRole: null },
    });
    await tx.productOption.update({ where: { id: text.id }, data: { keychainRole: 'NAME' } });
    await tx.productOption.update({ where: { id: color.id }, data: { keychainRole: 'COLOR' } });
    return { ok: true };
  });
}

export function getOrCreateKeychainStarter() {
  return serializable(async (tx) => {
    const existing = await tx.product.findUnique({
      where: { id: KEYCHAIN_STARTER_ID },
      select: { id: true },
    });
    if (existing) return existing;
    const slug = 'privrzok-so-ime';
    const sku = 'GX-NAME-KEYCHAIN';
    const collision = await tx.product.findFirst({
      where: { OR: [{ slug }, { sku }] },
      select: { id: true },
    });
    const suffix = collision ? '-' + randomUUID().slice(0, 8) : '';
    return tx.product.create({
      data: {
        id: KEYCHAIN_STARTER_ID,
        name: 'Приврзок со име',
        slug: slug + suffix,
        sku: sku + suffix,
        published: false,
        isNew: false,
        price: 0,
        inventoryMode: 'MADE_TO_ORDER',
        shortDescription: 'Персонализиран приврзок со име и боја по избор.',
        description: 'Внеси име, избери боја и прегледај го натписот пред нарачка.',
        options: { create: { name: 'Име / Name', kind: 'TEXT', required: true } },
      },
      select: { id: true },
    });
  });
}

export async function validateStarterPublication(
  tx: Prisma.TransactionClient,
  id: string | undefined,
  input: { published: boolean; price: number; salePrice: number | null },
) {
  if (id !== KEYCHAIN_STARTER_ID || !input.published) return;
  if (!(input.price > 0 && (input.salePrice === null || input.salePrice > 0)))
    throw new HttpError(400, 'Set your actual selling price before publishing the name keychain.');
  const product = await tx.product.findUniqueOrThrow({
    where: { id },
    select: { published: true, options: { include: { values: true } } },
  });
  if (!product.published && !keychainOptions(product.options))
    throw new HttpError(
      400,
      'Save the name preview with your available colors before publishing this draft.',
    );
}

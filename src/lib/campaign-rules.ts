import { z } from 'zod';

export const CAMPAIGN_TIME_ZONE = 'Europe/Skopje';
const optionalDate = z.union([z.iso.date(), z.literal('')]);
export const blackFridaySchema = z
  .object({
    enabled: z.boolean(),
    startsOn: optionalDate,
    endsOn: optionalDate,
    discountPercent: z.number().int().min(1).max(90),
    productIds: z.array(z.string().min(1).max(100)).max(1000),
    categoryIds: z.array(z.string().min(1).max(100)).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.enabled && (!v.startsOn || !v.endsOn))
      ctx.addIssue({ code: 'custom', message: 'Choose both campaign dates before enabling.' });
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn)
      ctx.addIssue({ code: 'custom', message: 'End date must be on or after the start date.' });
    if (v.enabled && !v.productIds.length && !v.categoryIds.length)
      ctx.addIssue({ code: 'custom', message: 'Choose at least one product or category.' });
  });

export type BlackFriday = z.infer<typeof blackFridaySchema>;
export const defaultBlackFriday: BlackFriday = {
  enabled: false,
  startsOn: '',
  endsOn: '',
  discountPercent: 20,
  productIds: [],
  categoryIds: [],
};

export function campaignStatus(c: BlackFriday, now = new Date()) {
  if (!c.enabled || !c.startsOn || !c.endsOn) return 'off';
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CAMPAIGN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (today < c.startsOn) return 'scheduled';
  if (today > c.endsOn) return 'ended';
  return 'active';
}

type CampaignProduct = { id: string; categories?: { categoryId: string }[] };
export function campaignPercent(p: CampaignProduct, c: BlackFriday, now = new Date()) {
  if (campaignStatus(c, now) !== 'active') return 0;
  return c.productIds.includes(p.id) ||
    p.categories?.some(({ categoryId }) => c.categoryIds.includes(categoryId))
    ? c.discountPercent
    : 0;
}

export function withCampaign<T extends CampaignProduct>(p: T, c: BlackFriday, now = new Date()) {
  return { ...p, blackFridayPercent: campaignPercent(p, c, now) };
}

export type PricedProduct = {
  price: number;
  salePrice: number | null;
  blackFridayPercent?: number;
};
export type PricedVariant = { price: number | null; priceAdjustment: number };
export function productPrice(p: PricedProduct, variant?: PricedVariant) {
  const regularPrice = variant?.price ?? p.price + (variant?.priceAdjustment ?? 0);
  const normalPrice = variant?.price ?? (p.salePrice ?? p.price) + (variant?.priceAdjustment ?? 0);
  const campaignPrice = p.blackFridayPercent
    ? Math.round((regularPrice * (100 - p.blackFridayPercent)) / 100)
    : normalPrice;
  return {
    regularPrice,
    price: Math.min(normalPrice, campaignPrice),
    blackFriday: !!p.blackFridayPercent,
  };
}

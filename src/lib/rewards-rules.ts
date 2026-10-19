import { z } from 'zod';

export const rewardsSettingsSchema = z.object({
  enabled: z.boolean(),
  earnEveryMkd: z.number().int().min(1).max(10000),
  minimumDiscountPoints: z.number().int().min(1).max(100000),
  maxDiscountPercent: z.number().int().min(1).max(50),
});
export type RewardsSettings = z.infer<typeof rewardsSettingsSchema>;
export const defaultRewardsSettings: RewardsSettings = {
  enabled: true,
  earnEveryMkd: 20,
  minimumDiscountPoints: 100,
  maxDiscountPercent: 20,
};
export const rewardSelectionSchema = z.object({
  discountPoints: z.number().int().min(0).max(10000000).default(0),
  giftId: z.string().max(100).default(''),
});
export type RewardSelection = z.infer<typeof rewardSelectionSchema>;
export function discountLimit(subtotal: number, balance: number, percent: number) {
  return Math.max(0, Math.min(balance, Math.floor((subtotal * percent) / 100)));
}
export function earnedPoints(productPayment: number, earnEveryMkd: number) {
  return Math.floor(Math.max(0, productPayment) / earnEveryMkd);
}
// Cumulative refund amounts make retries idempotent and avoid rounding drift.
export function refundTargets(input: {
  netProducts: number;
  refundedProducts: number;
  discountPoints: number;
  giftPoints: number;
  giftReturned: boolean;
  earnEveryMkd: number;
}) {
  return {
    earned: earnedPoints(input.netProducts - input.refundedProducts, input.earnEveryMkd),
    restored:
      (input.netProducts > 0
        ? Math.floor((input.discountPoints * input.refundedProducts) / input.netProducts)
        : 0) + (input.giftReturned ? input.giftPoints : 0),
  };
}

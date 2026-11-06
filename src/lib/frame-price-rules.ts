import type { FrameSize } from './frame-artwork';

export const FRAME_PAPERS = ['glossy', 'matte'] as const;
export type FramePaper = (typeof FRAME_PAPERS)[number];
export type FramePrices = Partial<Record<FrameSize, Partial<Record<FramePaper, number>>>>;

export function frameUnitPrice(prices: FramePrices, size: FrameSize, paper: FramePaper) {
  return prices[size]?.[paper] ?? null;
}

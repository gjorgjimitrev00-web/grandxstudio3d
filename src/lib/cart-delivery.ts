export type DeliveryProgressSettings = { threshold: number; quoteMethodId: string };
type ShippingOption = { id: string; kind: string; price: number; freeThreshold: number | null };
export function deliveryProgressSettings(
  methods: ShippingOption[],
): DeliveryProgressSettings | null {
  const qualifying = methods.flatMap((m) => {
    if (m.kind === 'FREE') return [m.freeThreshold ?? 0];
    if (m.kind !== 'STANDARD') return [];
    return m.price === 0 ? [0] : m.freeThreshold === null ? [] : [m.freeThreshold];
  });
  if (!qualifying.length) return null;
  const source =
    methods.find((m) => m.kind === 'STANDARD') ??
    methods.find((m) => m.kind === 'PICKUP') ??
    methods.find((m) => m.kind === 'FREE');
  return source ? { threshold: Math.min(...qualifying), quoteMethodId: source.id } : null;
}

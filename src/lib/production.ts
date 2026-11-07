import { z } from 'zod';
import { db } from './db';
import { validDay } from './time';

export const stations = {
  printer: '3D printer',
  epson: 'Epson',
  packing: 'Packing',
  planning: 'Planning',
} as const;
export type JobKind = 'order' | 'custom' | 'frame';
export type Station = keyof typeof stations;
const planningFields = {
  productionDue: true,
  productionStation: true,
  productionMaterial: true,
} as const;
export const planSchema = z
  .object({
    productionDue: z.string().refine(validDay, 'Choose a valid date').nullable(),
    productionStation: z.enum(['printer', 'epson', 'packing', 'planning']).nullable(),
    productionMaterial: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();
export const openOrders = ['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY'] as const;
export const openRequests = ['NEW', 'REVIEWING', 'QUOTE_SENT', 'APPROVED', 'PRINTING'] as const;
const nextStep: Record<string, string> = {
  NEW: 'Review',
  CONFIRMED: 'Prepare items',
  IN_PRODUCTION: 'Produce',
  READY: 'Pack for dispatch',
  REVIEWING: 'Prepare quote',
  QUOTE_SENT: 'Await approval',
  APPROVED: 'Prepare print',
  PRINTING: 'Print',
};
export type ProductionJob = {
  id: string;
  kind: JobKind;
  source: string;
  title: string;
  customer: string;
  quantity: number;
  status: string;
  next: string;
  link: string;
  eventLink?: string;
  due: string | null;
  station: Station;
  material: string;
  defaultMaterial: string | null;
  created: Date;
  plan: {
    productionDue: string | null;
    productionStation: string | null;
    productionMaterial: string | null;
  };
};
function station(value: string | null, fallback: Station): Station {
  return value && Object.hasOwn(stations, value) ? (value as Station) : fallback;
}
function stored(row: ProductionJob['plan']) {
  return {
    productionDue: row.productionDue,
    productionStation: row.productionStation,
    productionMaterial: row.productionMaterial,
  };
}
export async function productionJobs() {
  const [orders, custom, frames] = await Promise.all([
    db.order.findMany({
      where: { status: { in: [...openOrders] } },
      select: {
        id: true,
        number: true,
        source: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        ...planningFields,
        eventRequest: { select: { id: true, readyBy: true, eventDate: true } },
        items: {
          select: {
            name: true,
            quantity: true,
            madeToOrder: true,
            selections: { select: { optionName: true, value: true } },
          },
        },
      },
    }),
    db.customPrintRequest.findMany({
      where: { status: { in: [...openRequests] } },
      select: {
        id: true,
        name: true,
        description: true,
        quantity: true,
        material: true,
        color: true,
        status: true,
        createdAt: true,
        ...planningFields,
      },
    }),
    db.frameOrder.findMany({
      where: { status: { in: [...openRequests] } },
      select: {
        id: true,
        reference: true,
        name: true,
        quantity: true,
        status: true,
        paper: true,
        createdAt: true,
        ...planningFields,
      },
    }),
  ]);
  const jobs: ProductionJob[] = [];
  for (const o of orders) {
    const event = o.eventRequest;
    const material =
      [
        ...new Set(
          o.items.flatMap((i) =>
            i.selections
              .filter((s) => /material|материјал|filament|филамент/i.test(s.optionName))
              .map((s) => s.value),
          ),
        ),
      ].join(', ') || null;
    const print = o.items.some((i) => i.madeToOrder);
    jobs.push({
      id: o.id,
      kind: 'order',
      source: event ? 'Event order' : o.source === 'MANUAL' ? 'Walk-in' : 'Shop',
      title: o.number + ' · ' + o.items.map((i) => i.quantity + ' × ' + i.name).join(', '),
      quantity: o.items.reduce((sum, i) => sum + i.quantity, 0),
      customer: (o.firstName + ' ' + o.lastName).trim(),
      status: o.status,
      next: nextStep[o.status],
      link: '/admin/orders/' + o.id,
      eventLink: event ? '/admin/event-orders/' + event.id : undefined,
      due: o.productionDue || event?.readyBy || event?.eventDate || null,
      station: station(o.productionStation, o.status === 'READY' || !print ? 'packing' : 'printer'),
      material: o.productionMaterial || material || '—',
      defaultMaterial: material,
      created: o.createdAt,
      plan: stored(o),
    });
  }
  for (const r of custom) {
    const material = [r.material, r.color].filter(Boolean).join(' · ') || null;
    jobs.push({
      id: r.id,
      kind: 'custom',
      source: 'Custom print',
      title: r.description,
      customer: r.name,
      quantity: r.quantity,
      status: r.status,
      next: nextStep[r.status],
      link: '/admin/custom-orders/' + r.id,
      due: r.productionDue,
      station: station(
        r.productionStation,
        ['APPROVED', 'PRINTING'].includes(r.status) ? 'printer' : 'planning',
      ),
      material: r.productionMaterial || material || '—',
      defaultMaterial: material,
      created: r.createdAt,
      plan: stored(r),
    });
  }
  for (const f of frames) {
    const material = f.paper === 'glossy' ? 'Glossy paper' : 'Matte paper';
    jobs.push({
      id: f.id,
      kind: 'frame',
      source: 'Frame',
      title: f.reference,
      customer: f.name,
      quantity: f.quantity,
      status: f.status,
      next: nextStep[f.status],
      link: '/admin/frame-orders/' + f.id,
      due: f.productionDue,
      station: station(f.productionStation, 'epson'),
      material: f.productionMaterial || material,
      defaultMaterial: material,
      created: f.createdAt,
      plan: stored(f),
    });
  }
  return jobs.sort(
    (a, b) =>
      (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') ||
      a.created.getTime() - b.created.getTime() ||
      a.id.localeCompare(b.id),
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RequestStatus } from '@prisma/client';
import { AdminHeading } from '@/components/admin-shared';
import { FrameStatusForm } from '@/components/frame-admin-forms';
import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { framePaperDimensions, frameDesignSchema } from '@/lib/frame-artwork';
import { money } from '@/lib/utils';

const templateLabels = {
  love: 'Love, in Every Frame',
  story: 'The Story of Us',
  moments: 'Our Moments',
  custom: 'Customer artwork',
};

export default async function FrameOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const order = await db.frameOrder.findUnique({ where: { id: (await params).id } });
  if (!order) notFound();
  const design = frameDesignSchema.safeParse(order.design);
  const size = design.success ? framePaperDimensions(design.data) : null;
  const ppis = Array.isArray(order.effectivePpi)
    ? order.effectivePpi.filter((p): p is number => typeof p === 'number')
    : [];
  const fileUrl = `/api/admin/frame-orders/${order.id}`;
  return (
    <>
      <Link className="text-link" href="/admin/frame-orders">
        ← Frame orders
      </Link>
      <AdminHeading
        title={order.reference}
        sub={order.createdAt.toLocaleString('mk-MK', { timeZone: 'Europe/Skopje' })}
      >
        <a className="button" href={`${fileUrl}/print`} download>
          Download print PDF
        </a>
      </AdminHeading>
      <div className="two-column">
        <section className="panel">
          <h2>Print proof</h2>
          <img
            src={`${fileUrl}/preview`}
            alt="Print proof for this frame order"
            style={{
              display: 'block',
              width: '100%',
              maxHeight: '70vh',
              objectFit: 'contain',
              background: 'var(--cream, #faf8f5)',
            }}
          />
          {design.success && size && (
            <p className="small">
              {templateLabels[design.data.template]} · {design.data.size} · {size.widthMm} ×{' '}
              {size.heightMm} mm
            </p>
          )}
          {ppis.length > 0 && (
            <p className="small">
              Source resolution after cropping: {ppis.map((value) => Math.round(value)).join(' / ')}{' '}
              ppi.
              {ppis.some((value) => value < 300) &&
                ' Check the softest photo at print size before production.'}
            </p>
          )}
        </section>
        <div className="stack">
          <section className="panel">
            <h2>Print job</h2>
            <dl className="detail-list">
              <div>
                <dt>Paper</dt>
                <dd>{order.paper === 'glossy' ? 'Glossy' : 'Matte'}</dd>
              </div>
              <div>
                <dt>Copies</dt>
                <dd>{order.quantity}</dd>
              </div>
              <div>
                <dt>Price per frame</dt>
                <dd>{order.unitPrice === null ? 'Quote requested' : money(order.unitPrice)}</dd>
              </div>
              {order.unitPrice !== null && (
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(order.unitPrice * order.quantity)}</dd>
                </div>
              )}
            </dl>
            <p className="small">
              On the Epson L18050, select the matching sheet size and paper type. Print at Actual
              Size (100%) and check the driver’s borderless expansion before printing the batch.
            </p>
          </section>
          <section className="panel">
            <h2>Customer</h2>
            <p>
              {order.name}
              <br />
              <a href={`mailto:${order.email}`}>{order.email}</a>
              <br />
              <a href={`tel:${order.phone}`}>{order.phone}</a>
            </p>
            {order.notes && <p className="pre-line">{order.notes}</p>}
          </section>
          <section className="panel">
            <h2>Production status</h2>
            <FrameStatusForm
              id={order.id}
              status={order.status}
              options={Object.values(RequestStatus)}
            />
          </section>
        </div>
      </div>
    </>
  );
}

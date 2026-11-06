import Link from 'next/link';
import { AdminHeading } from '@/components/admin-shared';
import { FramePriceForm } from '@/components/frame-admin-forms';
import { FRAME_SIZES, type FrameSize } from '@/lib/frame-artwork';
import { requireAdminPage } from '@/lib/admin-access';
import { framePriceSettings } from '@/lib/frame-pricing';

export default async function FramePricesPage() {
  await requireAdminPage();
  const settings = await framePriceSettings();
  const sizes = Object.entries(FRAME_SIZES).map(([id, dimensions]) => ({
    id: id as FrameSize,
    dimensions: `${dimensions.widthMm} × ${dimensions.heightMm} mm`,
  }));
  return (
    <>
      <AdminHeading
        title="Frame prices"
        sub="Set the price per framed print in denars. Leave a price blank to offer a quote for that size and paper."
      >
        <Link href="/admin/frame-orders" className="text-link">
          Frame orders
        </Link>
      </AdminHeading>
      <FramePriceForm sizes={sizes} {...settings} />
    </>
  );
}

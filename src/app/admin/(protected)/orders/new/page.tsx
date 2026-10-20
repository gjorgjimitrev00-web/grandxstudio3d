import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { studioDay } from '@/lib/time';
import { AdminHeading } from '@/components/admin-shared';
import { ManualOrderForm } from '@/components/manual-order-form';
import Link from 'next/link';

export default async function NewManualOrder() {
  await requireAdminPage();
  const products = await db.product.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      salePrice: true,
      stock: true,
      trackInventory: true,
      inventoryMode: true,
      variants: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          priceAdjustment: true,
          stock: true,
          enabled: true,
        },
      },
    },
  });
  return (
    <>
      <AdminHeading
        title="Add an order"
        sub="Record an in-person sale or an order arranged outside the website."
      >
        <Link className="button outline" href="/admin/orders">
          All orders
        </Link>
      </AdminHeading>
      <ManualOrderForm products={products} today={studioDay()} />
    </>
  );
}

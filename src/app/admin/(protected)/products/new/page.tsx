import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { ProductEditor } from '@/components/product-editor';
import { AdminHeading } from '@/components/admin-shared';
export default async function NewProduct() {
  await requireAdminPage();
  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } });
  return (
    <>
      <AdminHeading
        title="Add a product"
        sub="Start with the essentials, then add your images and options."
      />
      <ProductEditor categories={categories} />
    </>
  );
}

import { requireAdminPage } from '@/lib/admin-access';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { ProductEditor } from '@/components/product-editor';
import { AdminHeading } from '@/components/admin-shared';
import { serialize } from '@/lib/utils';
export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const [p, categories] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        categories: true,
        specifications: true,
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        options: { include: { values: true } },
        variants: { include: { values: true } },
      },
    }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  if (!p) notFound();
  return (
    <>
      <AdminHeading title={p.name} sub="Product settings, imagery, and variants." />
      <ProductEditor
        key={p.updatedAt.toISOString()}
        product={serialize(p)}
        categories={categories}
      />
    </>
  );
}

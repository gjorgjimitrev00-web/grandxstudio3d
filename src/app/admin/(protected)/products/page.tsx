import { requireAdminPage } from '@/lib/admin-access';
import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { money } from '@/lib/utils';
import { AdminHeading, Pager } from '@/components/admin-shared';
import { ActionButton } from '@/components/api-form';
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const where: Prisma.ProductWhereInput = p.q
    ? { OR: [{ name: { contains: p.q.slice(0, 100) } }, { sku: { contains: p.q.slice(0, 100) } }] }
    : {};
  const [products, count] = await Promise.all([
    db.product.findMany({
      where,
      take: 20,
      skip: (page - 1) * 20,
      orderBy: { createdAt: 'desc' },
      include: {
        images: { take: 1, orderBy: { isPrimary: 'desc' } },
        variants: { select: { stock: true, enabled: true } },
      },
    }),
    db.product.count({ where }),
  ]);
  return (
    <>
      <AdminHeading title="Products" sub="Build your collection, one thoughtful design at a time.">
        <Link className="button" href="/admin/products/new">
          Add product +
        </Link>
      </AdminHeading>
      <form className="admin-search">
        <input
          name="q"
          defaultValue={p.q}
          placeholder="Search product or SKU"
          aria-label="Search products"
        />
        <button className="button outline">Search</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Inventory</th>
              <th>Visibility</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link className="table-product" href={`/admin/products/${p.id}`}>
                    <img src={p.images[0]?.thumbnailUrl || '/favicon.svg'} alt="" />
                    <div>
                      <b>{p.name}</b>
                      <small>{p.sku}</small>
                    </div>
                  </Link>
                </td>
                <td>{money(p.salePrice ?? p.price)}</td>
                <td>
                  <span className="status-pill">{p.inventoryMode.replaceAll('_', ' ')}</span>
                  <p className="small muted">
                    {p.trackInventory
                      ? `${p.variants.length ? p.variants.filter((v) => v.enabled).reduce((n, v) => n + v.stock, 0) : p.stock} units`
                      : 'Not tracked'}
                  </p>
                </td>
                <td>
                  {p.published ? 'Published' : 'Draft'}
                  {p.featured && <p className="small orange">Featured</p>}
                </td>
                <td>
                  <div className="table-actions">
                    <Link className="text-link" href={`/admin/products/${p.id}`}>
                      Edit
                    </Link>
                    <ActionButton
                      endpoint={`/api/admin/products/${p.id}/duplicate`}
                      redirect="result"
                    >
                      Duplicate
                    </ActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!products.length && <div className="empty">No products yet. Add your first design.</div>}
      </div>
      <Pager
        page={page}
        count={count}
        path="/admin/products"
        query={p.q ? `&q=${encodeURIComponent(p.q)}` : ''}
      />
    </>
  );
}

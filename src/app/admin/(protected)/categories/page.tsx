import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { serialize } from '@/lib/utils';
import { AdminHeading } from '@/components/admin-shared';
import { CategoryForm } from '@/components/admin-forms';
import { ActionButton } from '@/components/api-form';
import { CHRISTMAS_CATEGORY_SLUG } from '@/lib/catalog-visibility';
export default async function Categories() {
  await requireAdminPage();
  const categories = await db.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  const christmas = categories.find((c) => c.slug === CHRISTMAS_CATEGORY_SLUG);
  return (
    <>
      <AdminHeading
        title="Categories"
        sub="Organise your collection and choose its order in the store."
      />
      {christmas && (
        <section className="panel seasonal-panel" aria-labelledby="christmas-title">
          <div>
            <p className="eyebrow">Сезонска колекција</p>
            <h2 id="christmas-title">Christmas / Новогодишни декорации</h2>
            <p className="muted">
              {christmas._count.products} производи · {christmas.enabled ? 'Вклучена' : 'Исклучена'}
              . Еден прекинувач за колекцијата, производите и новогодишната фотографија на
              почетната.
            </p>
          </div>
          <ActionButton
            endpoint={`/api/admin/categories/${christmas.id}`}
            method="PATCH"
            data={{ enabled: !christmas.enabled }}
          >
            {christmas.enabled ? 'Исклучи Christmas' : 'Вклучи Christmas'}
          </ActionButton>
        </section>
      )}
      <section className="panel">
        <details>
          <summary>+ Create category</summary>
          <CategoryForm />
        </details>
      </section>
      <div className="stack editor-section">
        {categories.map((c) => (
          <section className="panel" key={c.id}>
            <details>
              <summary>
                {c.name}{' '}
                <span className="muted">
                  / {c.slug} · {c.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </summary>
              <CategoryForm key={`${c.id}:${c.enabled}`} category={serialize(c)} />
            </details>
          </section>
        ))}
      </div>
    </>
  );
}

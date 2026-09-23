import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { serialize } from '@/lib/utils';
import { AdminHeading } from '@/components/admin-shared';
import { CategoryForm } from '@/components/admin-forms';
export default async function Categories() {
  await requireAdminPage();
  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } });
  return (
    <>
      <AdminHeading
        title="Categories"
        sub="Organise your collection and choose its order in the store."
      />
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
              <CategoryForm category={serialize(c)} />
            </details>
          </section>
        ))}
      </div>
    </>
  );
}

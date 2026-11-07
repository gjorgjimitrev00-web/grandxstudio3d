import { AdminHeading, Pager } from '@/components/admin-shared';
import { GiftTagEditor } from '@/components/gift-tag-editor';
import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { giftTags, occasions, recipients } from '@/lib/gift-finder';
export default async function GiftAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const query = typeof q.q === 'string' ? q.q.trim().slice(0, 140) : '';
  const where = query ? { OR: [{ name: { contains: query } }, { sku: { contains: query } }] } : {};
  const count = await db.product.count({ where });
  const page = Math.max(
    1,
    Math.min(Math.max(1, Math.ceil(count / 20)), parseInt(String(q.page || '1'), 10) || 1),
  );
  const rows = await db.product.findMany({
    where,
    take: 20,
    skip: (page - 1) * 20,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      slug: true,
      sku: true,
      name: true,
      published: true,
      giftProfile: true,
      categories: { include: { category: { select: { name: true, slug: true } } } },
    },
  });
  return (
    <>
      <AdminHeading
        title="Gift finder"
        sub="Choose which occasions and recipients match each product. Unedited products use suggestions based on their name and category."
      />
      <form className="row">
        <input
          type="search"
          name="q"
          aria-label="Product name or SKU"
          placeholder="Product name or SKU"
          defaultValue={query}
        />
        <button className="button outline">Search</button>
      </form>
      <div className="stack">
        {rows.map((p) => {
          const tags = giftTags(p);
          return (
            <article className="panel" key={p.id}>
              <h3>{p.name}</h3>
              <p className="small muted">
                {p.sku} · {p.giftProfile ? 'Custom' : 'Automatic'} ·{' '}
                {p.published ? 'Published' : 'Draft'}
              </p>
              <p>
                {[
                  ...tags.occasions.map((k) => occasions[k][1]),
                  ...tags.recipients.map((k) => recipients[k][1]),
                ].join(' · ') || 'No matches'}
              </p>
              <GiftTagEditor
                key={p.id + JSON.stringify(p.giftProfile)}
                id={p.id}
                initial={tags}
                custom={!!p.giftProfile}
              />
            </article>
          );
        })}
      </div>
      <Pager
        page={page}
        count={count}
        path="/admin/gift-finder"
        query={query ? '&q=' + encodeURIComponent(query) : ''}
      />
    </>
  );
}

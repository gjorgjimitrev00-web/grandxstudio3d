import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { AdminHeading, Pager } from '@/components/admin-shared';
import { ActionButton } from '@/components/api-form';
export default async function Newsletter({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const page = Math.max(1, Math.min(10000, Number((await searchParams).page) || 1));
  const [rows, count] = await Promise.all([
    db.newsletterSubscriber.findMany({
      take: 20,
      skip: (page - 1) * 20,
      orderBy: { createdAt: 'desc' },
    }),
    db.newsletterSubscriber.count(),
  ]);
  return (
    <>
      <AdminHeading
        title="Newsletter"
        sub="Manage subscribers. No emails are sent automatically."
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Subscribed</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>{r.createdAt.toLocaleDateString('mk-MK')}</td>
                <td>{r.active ? 'Active' : 'Inactive'}</td>
                <td>
                  <ActionButton
                    endpoint={`/api/admin/newsletter/${r.id}`}
                    method="PATCH"
                    data={{ active: !r.active }}
                  >
                    {r.active ? 'Deactivate' : 'Reactivate'}
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No subscribers yet.</div>}
      </div>
      <Pager page={page} count={count} path="/admin/newsletter" />
    </>
  );
}

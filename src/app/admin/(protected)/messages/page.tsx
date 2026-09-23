import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { AdminHeading, Pager } from '@/components/admin-shared';
import { ActionButton } from '@/components/api-form';
export default async function Messages({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const page = Math.max(1, Math.min(10000, Number((await searchParams).page) || 1));
  const [messages, count] = await Promise.all([
    db.contactMessage.findMany({ take: 20, skip: (page - 1) * 20, orderBy: { createdAt: 'desc' } }),
    db.contactMessage.count(),
  ]);
  return (
    <>
      <AdminHeading title="Messages" sub="Questions and conversations from your store." />
      <div className="stack">
        {messages.map((m) => (
          <section className="panel" key={m.id}>
            <details>
              <summary>
                {m.subject} <span className="status-pill">{m.read ? 'Read' : 'New'}</span>
              </summary>
              <p className="small muted">
                {m.name} · {m.email} · {m.phone} · {m.createdAt.toLocaleString('mk-MK')}
              </p>
              <p className="pre-line message-body">{m.message}</p>
              <ActionButton
                endpoint={`/api/admin/messages/${m.id}`}
                method="PATCH"
                data={{ read: !m.read }}
              >
                {m.read ? 'Mark unread' : 'Mark read'}
              </ActionButton>
            </details>
          </section>
        ))}
      </div>
      {!messages.length && <div className="empty">No messages yet.</div>}
      <Pager page={page} count={count} path="/admin/messages" />
    </>
  );
}

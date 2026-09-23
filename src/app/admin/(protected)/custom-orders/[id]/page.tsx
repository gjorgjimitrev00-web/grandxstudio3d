import { requireAdminPage } from '@/lib/admin-access';
import { notFound } from 'next/navigation';
import { RequestStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { AdminHeading } from '@/components/admin-shared';
import { StatusForm } from '@/components/admin-forms';
export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const r = await db.customPrintRequest.findUnique({
    where: { id: (await params).id },
    include: { files: true },
  });
  if (!r) notFound();
  return (
    <>
      <AdminHeading title={`Custom print · ${r.name}`} sub={r.createdAt.toLocaleString('mk-MK')} />
      <div className="two-column">
        <div className="stack">
          <section className="panel">
            <h2>Project brief</h2>
            <p className="pre-line">{r.description}</p>
            <dl className="detail-list">
              {[
                ['Dimensions', r.dimensions],
                ['Colour', r.color],
                ['Material', r.material],
                ['Quantity', r.quantity],
                ['Notes', r.notes],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <h2>Private files</h2>
            {r.files.map((f) => (
              <a className="download-link" key={f.id} href={`/api/admin/files/${f.id}`} download>
                {f.originalName}
                <span>{(f.size / 1024 / 1024).toFixed(2)} MB ↓</span>
              </a>
            ))}
            {!r.files.length && <p className="muted">No attachments.</p>}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h2>Contact</h2>
            <p>
              {r.name}
              <br />
              {r.phone}
              <br />
              {r.email}
            </p>
          </section>
          <section className="panel">
            <h2>Manage request</h2>
            <StatusForm
              endpoint={`/api/admin/custom-orders/${r.id}`}
              status={r.status}
              allowed={Object.values(RequestStatus)}
              notes={r.internalNotes}
            />
          </section>
        </div>
      </div>
    </>
  );
}

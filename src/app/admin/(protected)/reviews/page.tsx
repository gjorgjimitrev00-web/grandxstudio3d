import Link from 'next/link';
import { ReviewStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin-access';
import { AdminHeading, Pager } from '@/components/admin-shared';
import { ActionButton } from '@/components/api-form';
import '@/components/reviews.css';

export default async function ReviewsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const status =
    Object.values(ReviewStatus).find((s) => s === params.status) ?? ReviewStatus.PENDING;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page)) || 1));
  const [count, reviews] = await Promise.all([
    db.productReview.count({ where: { status } }),
    db.productReview.findMany({
      where: { status },
      take: 20,
      skip: 20 * (page - 1),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        rating: true,
        status: true,
        body: true,
        createdAt: true,
        consentAt: true,
        product: { select: { name: true, slug: true } },
        order: { select: { id: true, number: true } },
        photo: { select: { reviewId: true } },
      },
    }),
  ]);
  return (
    <>
      <AdminHeading
        title="Product reviews"
        sub="Approve buyer reviews and photos for the product page, or hide a published review."
      />
      <nav className="row" aria-label="Review status">
        {Object.values(ReviewStatus).map((s) => (
          <Link
            key={s}
            className="text-link"
            aria-current={s === status ? 'page' : undefined}
            href={`/admin/reviews?status=${s}`}
          >
            {s}
          </Link>
        ))}
      </nav>
      <div className="stack">
        {reviews.map((r) => (
          <article className="panel review-moderation" key={r.id}>
            <h2>{r.product.name}</h2>
            <p>
              <b>{r.rating} / 5</b> ·{' '}
              <Link className="text-link" href={`/admin/orders/${r.order.id}`}>
                {r.order.number}
              </Link>
            </p>
            <p className="pre-line">{r.body}</p>
            {r.photo && (
              <img
                loading="lazy"
                src={`/api/admin/reviews/${r.id}/photo`}
                alt="Buyer's submitted photo"
              />
            )}
            <p className="small muted">
              Publication consent recorded{' '}
              {r.consentAt.toLocaleDateString('en-GB', { timeZone: 'Europe/Skopje' })}
            </p>
            <div className="row">
              {status !== 'APPROVED' && (
                <ActionButton
                  endpoint={`/api/admin/reviews/${r.id}`}
                  method="PATCH"
                  data={{ status: 'APPROVED', expectedStatus: status }}
                >
                  Publish
                </ActionButton>
              )}
              {status !== 'REJECTED' && (
                <ActionButton
                  endpoint={`/api/admin/reviews/${r.id}`}
                  method="PATCH"
                  data={{ status: 'REJECTED', expectedStatus: status }}
                >
                  {status === 'APPROVED' ? 'Hide review' : 'Decline'}
                </ActionButton>
              )}
            </div>
          </article>
        ))}
        {!count && <div className="empty">No {status.toLowerCase()} reviews.</div>}
      </div>
      <Pager count={count} page={page} path="/admin/reviews" query={`&status=${status}`} />
    </>
  );
}

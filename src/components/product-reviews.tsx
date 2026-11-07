import Link from 'next/link';
import { db } from '@/lib/db';
import { getLocale } from '@/lib/i18n';
import { publicReviewWhere } from '@/lib/product-reviews';
import './reviews.css';

export async function ProductReviews({
  productId,
  slug,
  requestedPage,
}: {
  productId: string;
  slug: string;
  requestedPage?: string;
}) {
  const where = { ...publicReviewWhere, productId };
  const [locale, stats] = await Promise.all([
    getLocale(),
    db.productReview.aggregate({ where, _count: true, _avg: { rating: true } }),
  ]);
  if (!stats._count) return null;
  const mk = locale === 'mk';
  const pages = Math.ceil(stats._count / 8);
  const page = Math.max(1, Math.min(pages, Math.floor(Number(requestedPage)) || 1));
  const reviews = await db.productReview.findMany({
    where,
    select: {
      id: true,
      rating: true,
      body: true,
      createdAt: true,
      photo: { select: { reviewId: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * 8,
    take: 8,
  });
  const url = (p: number) => `/product/${slug}?reviewsPage=${p}#reviews`;
  return (
    <section className="product-reviews" id="reviews">
      <h2>{mk ? 'Рецензии од купувачи' : 'Customer reviews'}</h2>
      <p>
        <strong>
          {(stats._avg.rating ?? 0).toLocaleString(mk ? 'mk-MK' : 'en-GB', {
            maximumFractionDigits: 1,
          })}{' '}
          / 5
        </strong>
        {' · '}
        {mk ? 'Вкупно рецензии' : 'Reviews'}: {stats._count}
      </p>
      <div className="review-grid">
        {reviews.map((review) => (
          <article key={review.id}>
            <div className="review-meta">
              <strong>{review.rating} / 5</strong>
              <span>{mk ? 'Потврден купувач' : 'Verified buyer'}</span>
              <time dateTime={review.createdAt.toISOString()}>
                {review.createdAt.toLocaleDateString(mk ? 'mk-MK' : 'en-GB', {
                  timeZone: 'Europe/Skopje',
                })}
              </time>
            </div>
            <p className="pre-line">{review.body}</p>
            {review.photo && (
              <img
                loading="lazy"
                src={`/api/reviews/${review.id}/photo`}
                alt={mk ? 'Фотографија од купувачот' : 'Customer photo'}
              />
            )}
          </article>
        ))}
      </div>
      {pages > 1 && (
        <nav className="review-pages" aria-label={mk ? 'Страници со рецензии' : 'Review pages'}>
          {page > 1 && <Link href={url(page - 1)}>← {mk ? 'Претходни' : 'Previous'}</Link>}
          <span>
            {page} / {pages}
          </span>
          {page < pages && <Link href={url(page + 1)}>{mk ? 'Следни' : 'Next'} →</Link>}
        </nav>
      )}
    </section>
  );
}

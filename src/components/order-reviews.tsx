import { db } from '@/lib/db';
import { getLocale } from '@/lib/i18n';
import { ApiForm } from './api-form';
import './reviews.css';

type Item = { productId: string | null; name: string; rewardGift: boolean };

export async function OrderReviews({
  orderId,
  number,
  items,
}: {
  orderId: string;
  number: string;
  items: Item[];
}) {
  const products = new Map<string, string>();
  for (const item of items)
    if (item.productId && !item.rewardGift) products.set(item.productId, item.name);
  if (!products.size) return null;
  const [locale, reviews] = await Promise.all([
    getLocale(),
    db.productReview.findMany({ where: { orderId }, select: { productId: true, status: true } }),
  ]);
  const mk = locale === 'mk';
  return (
    <section className="order-reviews panel">
      <h2>{mk ? 'Како ти се допаѓа нарачката?' : 'How was your order?'}</h2>
      <p className="muted">
        {mk
          ? 'Твоето искуство ќе им помогне на следните купувачи.'
          : 'Your experience helps other shoppers choose.'}
      </p>
      {[...products].map(([productId, name]) => {
        const previous = reviews.find((review) => review.productId === productId);
        if (previous)
          return (
            <div className="review-item" key={productId}>
              <strong>{name}</strong>
              <p className="small">
                {previous.status === 'PENDING'
                  ? mk
                    ? 'Рецензијата чека одобрување.'
                    : 'Your review is awaiting approval.'
                  : previous.status === 'APPROVED'
                    ? mk
                      ? 'Рецензијата е објавена.'
                      : 'Your review is published.'
                    : mk
                      ? 'Рецензијата не е објавена.'
                      : 'Your review has not been published.'}
              </p>
            </div>
          );
        return (
          <details className="review-item" key={productId}>
            <summary>
              {mk ? 'Оцени' : 'Review'} · {name}
            </summary>
            <ApiForm
              endpoint={`/order-confirmation/${number}/reviews`}
              multipart
              refresh
              submit={mk ? 'Испрати рецензија' : 'Submit review'}
              success={mk ? 'Рецензијата е испратена.' : 'Review submitted.'}
            >
              <input type="hidden" name="productId" value={productId} />
              <label>
                {mk ? 'Оцена' : 'Rating'}
                <select name="rating" required defaultValue="">
                  <option value="" disabled>
                    {mk ? 'Избери оцена' : 'Choose a rating'}
                  </option>
                  {[5, 4, 3, 2, 1].map((score) => (
                    <option key={score} value={score}>
                      {score} / 5
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {mk ? 'Твое мислење' : 'Your review'}
                <textarea name="body" required minLength={3} maxLength={1500} rows={3} />
              </label>
              <label>
                {mk ? 'Фотографија (по избор)' : 'Photo (optional)'}
                <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" />
                <small>JPEG, PNG, WebP · 5 MB</small>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="consent" value="yes" required />
                <span>
                  {mk
                    ? 'Се согласувам GrandXStudio јавно да ги објави мојата оцена, текстот и фотографијата ако ја додадам. Моето име нема да се прикаже.'
                    : 'I agree that GrandXStudio may publish my rating, text and any photo I add. My name will stay private.'}
                </span>
              </label>
            </ApiForm>
          </details>
        );
      })}
    </section>
  );
}

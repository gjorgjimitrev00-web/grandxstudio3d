import Link from 'next/link';
import { Gift, Sparkles, ArrowUpRight } from 'lucide-react';
import { currentUser } from '@/lib/security';
import { getLocale } from '@/lib/i18n';
import { rewardsSettings, rewardsSummary, availableGifts } from '@/lib/rewards';
import { rewardsCopy } from '@/lib/rewards-copy';
import { RewardsHistory } from '@/components/rewards-history';
export const metadata = {
  title: 'GrandX Rewards',
  description: 'Earn points for discounts and printed gifts at GrandXStudio.',
};

export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [user, locale, settings, gifts, query] = await Promise.all([
    currentUser(),
    getLocale(),
    rewardsSettings(),
    availableGifts(),
    searchParams,
  ]);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.page) || 1)));
  const summary = user ? await rewardsSummary(user.id, page) : null;
  const balance = Math.max(0, summary?.balance || 0);
  const t = rewardsCopy[locale];
  const mk = locale === 'mk';
  return (
    <div className="page rewards-page">
      <section className="rewards-hero">
        <div>
          <p className="eyebrow">GRANDX REWARDS</p>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
          <Link className="button" href={user ? '/shop' : '/account'}>
            {user ? t.shop : t.signIn}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="rewards-emblem" aria-hidden="true">
          <Gift strokeWidth={1} />
          <Sparkles size={28} />
        </div>
      </section>
      {!settings.enabled && <p className="notice">{t.paused}</p>}
      <div className="rewards-stats">
        <section className="panel">
          <p className="eyebrow">{t.available}</p>
          <strong className="rewards-number">{summary?.balance || 0}</strong>
          <span>{t.points}</span>
          {summary && summary.balance < 0 && <p className="form-note">{t.debt}</p>}
        </section>
        <section className="panel">
          <p className="eyebrow">{t.pending}</p>
          <strong className="rewards-number">{summary?.pending || 0}</strong>
          <p className="form-note">{t.pendingNote}</p>
        </section>
        <section className="panel">
          <p className="eyebrow">{t.discount}</p>
          <h2>1 {mk ? 'поен' : 'point'} = 1 MKD</h2>
          <p>
            {mk
              ? `Од ${settings.minimumDiscountPoints} поени · до ${settings.maxDiscountPercent}% од производите во нарачката.`
              : `From ${settings.minimumDiscountPoints} points · up to ${settings.maxDiscountPercent}% of your product subtotal.`}
          </p>
          <progress
            max={settings.minimumDiscountPoints}
            value={Math.min(balance, settings.minimumDiscountPoints)}
            aria-label={t.discount}
          />
        </section>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">MADE TO MAKE YOU SMILE</p>
          <h2>{t.gifts}</h2>
        </div>
        <p className="muted">{t.checkout}</p>
      </div>
      <div className="rewards-grid">
        {gifts.map((gift) => (
          <article className="reward-card" key={gift.id}>
            <Link href={`/product/${gift.slug}`} className="reward-image">
              {gift.image ? (
                <img src={gift.image} alt={gift.name} loading="lazy" />
              ) : (
                <Gift size={64} strokeWidth={1} />
              )}
            </Link>
            <div>
              <h3>{gift.name}</h3>
              <p>
                <b>
                  {gift.points} {t.points}
                </b>
              </p>
              {user && (
                <p className="small muted">
                  {balance >= gift.points
                    ? mk
                      ? 'Подготвено за вас'
                      : 'Ready when you are'
                    : mk
                      ? `Уште ${gift.points - balance} поени`
                      : `${gift.points - balance} more points to go`}
                </p>
              )}
              <Link className="text-link" href={user ? '/checkout' : '/account'}>
                {user ? t.checkout : t.signIn} ↗
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!gifts.length && <p className="notice">{t.noGifts}</p>}
      <div className="two-column editor-section">
        <section className="panel">
          <h2>{t.rules}</h2>
          <ul className="rewards-rules">
            <li>
              {mk
                ? `Заработувате 1 поен за секои ${settings.earnEveryMkd} MKD платени за производи, по попусти. Заокружуваме надолу по нарачка. Доставата и подароците не носат поени.`
                : `Earn 1 point per ${settings.earnEveryMkd} MKD paid for products after discounts, rounded down per order. Delivery and gifts do not earn points.`}
            </li>
            <li>
              {mk
                ? 'Најавете се пред нарачката. Поените важат за нови нарачки преку вашиот профил. Претходни и гостински нарачки не се вклучени.'
                : 'Sign in before ordering. Points apply to new orders placed through your account. Earlier and guest orders are not included.'}
            </li>
            <li>{t.pendingNote}</li>
            <li>
              {mk
                ? `Попустот започнува од ${settings.minimumDiscountPoints} поени и покрива до ${settings.maxDiscountPercent}% од производите. Можете да додадете и еден подарок со платена нарачка ако имате доволно поени за двете награди.`
                : `Discounts start at ${settings.minimumDiscountPoints} points and cover up to ${settings.maxDiscountPercent}% of products. Add one gift to a paid order as well if you have enough points for both.`}
            </li>
            <li>
              {mk
                ? 'Поените се одземаат при нарачката. Попустот не ја менува веќе остварената бесплатна достава; подарокот не се брои кон прагот.'
                : 'Points are deducted when ordering. Rewards preserve free delivery already earned by the paid cart; gifts do not count toward the threshold.'}
            </li>
            <li>
              {mk
                ? 'Откажаните нарачки ги враќаат искористените поени. Враќањата ги намалуваат заработените поени и пропорционално ги враќаат поените за попуст. Поените за подарок се враќаат кога и подарокот е вратен.'
                : 'Cancellations restore spent points. Returns reduce earned points and restore discount points proportionally. Gift points are restored when the gift is returned.'}
            </li>
            <li>
              {mk
                ? 'Поените немаат рок, не се преносливи и не се исплаќаат во готово. Правилата за заработка се зачувуваат за секоја нарачка.'
                : 'Points do not expire, cannot be transferred and cannot be exchanged for cash. Each order retains the earning rules that applied when it was placed.'}
            </li>
            <li>
              {mk
                ? 'Состојбата, движењето на поените и поврзаните нарачки се чуваат со вашиот профил за управување со наградите.'
                : 'Your balance, points history and related orders are stored with your account to administer rewards.'}{' '}
              <Link href="/privacy">{mk ? 'Приватност' : 'Privacy'}</Link> ·{' '}
              <Link href="/returns">{mk ? 'Враќање' : 'Returns'}</Link>
            </li>
          </ul>
        </section>
        <section className="panel">
          <h2>{t.history}</h2>
          {summary ? (
            <>
              <RewardsHistory history={summary.history} locale={locale} />
              <nav className="row" aria-label="Points history pages">
                {page > 1 && (
                  <Link className="text-link" href={`/rewards?page=${page - 1}`}>
                    {t.previous}
                  </Link>
                )}
                {summary.count > page * 20 && (
                  <Link className="text-link" href={`/rewards?page=${page + 1}`}>
                    {t.next}
                  </Link>
                )}
              </nav>
            </>
          ) : (
            <Link className="button outline" href="/account">
              {t.signIn}
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

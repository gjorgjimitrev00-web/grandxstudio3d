import Link from 'next/link';
import { rewardsCopy } from '@/lib/rewards-copy';
export function RewardsHistory({
  history,
  locale = 'en',
}: {
  locale?: 'en' | 'mk';
  history: {
    id: string;
    points: number;
    note: string;
    kind: string;
    createdAt: Date;
    order: { number: string } | null;
  }[];
}) {
  const t = rewardsCopy[locale];
  const labels: Record<string, string> =
    locale === 'mk'
      ? {
          EARNED: 'Заработени поени',
          REDEEMED: 'Искористени поени',
          RESTORED: 'Вратени поени',
          RETURN_ADJUSTMENT: 'Корекција по враќање',
          ADMIN_ADJUSTMENT: 'Корекција од студиото',
        }
      : {
          EARNED: 'Points earned',
          REDEEMED: 'Rewards used',
          RESTORED: 'Points restored',
          RETURN_ADJUSTMENT: 'Return adjustment',
          ADMIN_ADJUSTMENT: 'Studio adjustment',
        };
  return history.length ? (
    <ul className="rewards-history">
      {history.map((entry) => (
        <li key={entry.id}>
          <div>
            <b>{labels[entry.kind] || entry.kind}</b>
            <p className="small muted">
              {entry.createdAt.toLocaleDateString(locale === 'mk' ? 'mk-MK' : 'en-GB', {
                timeZone: 'Europe/Skopje',
              })}
              {entry.order && (
                <>
                  {' '}
                  ·{' '}
                  <Link href={`/order-confirmation/${entry.order.number}`}>
                    {entry.order.number}
                  </Link>
                </>
              )}
            </p>
            {entry.kind === 'ADMIN_ADJUSTMENT' && <p className="small">{entry.note}</p>}
          </div>
          <strong className={entry.points > 0 ? 'success-text' : ''}>
            {entry.points > 0 ? '+' : ''}
            {entry.points}
          </strong>
        </li>
      ))}
    </ul>
  ) : (
    <p className="muted">{t.noHistory}</p>
  );
}

'use client';
import Link from 'next/link';
import { rewardsCopy } from '@/lib/rewards-copy';
export type CheckoutRewards = {
  signedIn: boolean;
  enabled: boolean;
  balance: number;
  minimumDiscountPoints: number;
  maxDiscountPercent: number;
  locale: 'en' | 'mk';
  gifts: { id: string; name: string; points: number }[];
};
export function RewardsPicker({
  data,
  points,
  giftId,
  onPoints,
  onGift,
  maxDiscount,
}: {
  data: CheckoutRewards;
  points: number;
  giftId: string;
  maxDiscount: number;
  onPoints: (points: number) => void;
  onGift: (id: string) => void;
}) {
  const t = rewardsCopy[data.locale];
  return (
    <section className="panel rewards-checkout">
      <h2>GrandX Rewards</h2>
      {!data.signedIn ? (
        <Link href="/account" className="text-link">
          {t.signIn} ↗
        </Link>
      ) : !data.enabled ? (
        <p>{t.paused}</p>
      ) : (
        <div className="stack">
          <p>
            <b>
              {data.balance} {t.points}
            </b>{' '}
            · {t.available}
          </p>
          <label>
            {t.discountLabel}
            <input
              type="number"
              min="0"
              step="1"
              max={10000000}
              value={points}
              onChange={(e) =>
                onPoints(Math.max(0, Math.min(10000000, Math.floor(Number(e.target.value) || 0))))
              }
            />
          </label>
          <p className="form-note">
            1 {data.locale === 'mk' ? 'поен' : 'point'} = 1 MKD · {data.minimumDiscountPoints}+{' '}
            {t.points} · {data.maxDiscountPercent}% max.
          </p>
          <button
            type="button"
            className="button outline"
            disabled={maxDiscount < data.minimumDiscountPoints}
            onClick={() => onPoints(maxDiscount)}
          >
            {t.usePoints} ({maxDiscount})
          </button>
          <label>
            {t.giftLabel}
            <select value={giftId} onChange={(e) => onGift(e.target.value)}>
              <option value="">{t.noGift}</option>
              {data.gifts.map((g) => (
                <option value={g.id} key={g.id} disabled={g.points > Math.max(0, data.balance)}>
                  {g.name} · {g.points} {t.points}
                </option>
              ))}
            </select>
          </label>
          {(points > 0 || giftId) && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                onPoints(0);
                onGift('');
              }}
            >
              {t.clear}
            </button>
          )}
        </div>
      )}
      <p className="form-note">
        <Link href="/rewards" target="_blank">
          {t.rules} ↗
        </Link>
      </p>
    </section>
  );
}

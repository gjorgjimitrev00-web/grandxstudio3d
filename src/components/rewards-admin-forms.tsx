'use client';
import { useRef } from 'react';
import { ApiForm, ActionButton } from './api-form';
import type { RewardsSettings } from '@/lib/rewards-rules';

export function RewardsSettingsForm({ settings }: { settings: RewardsSettings }) {
  return (
    <ApiForm
      endpoint="/api/admin/rewards/settings"
      method="PUT"
      submit="Save rewards rules"
      refresh
      transform={(v) => ({
        enabled: v.enabled === 'on',
        earnEveryMkd: Number(v.earnEveryMkd),
        minimumDiscountPoints: Number(v.minimumDiscountPoints),
        maxDiscountPercent: Number(v.maxDiscountPercent),
      })}
    >
      <label className="checkbox">
        <input name="enabled" type="checkbox" defaultChecked={settings.enabled} />
        Enable earning and redemption
      </label>
      <div className="form-grid">
        <label>
          MKD spent to earn 1 point
          <input
            name="earnEveryMkd"
            type="number"
            min="1"
            max="10000"
            required
            defaultValue={settings.earnEveryMkd}
          />
        </label>
        <label>
          Minimum points for a discount
          <input
            name="minimumDiscountPoints"
            type="number"
            min="1"
            max="100000"
            required
            defaultValue={settings.minimumDiscountPoints}
          />
        </label>
        <label>
          Maximum product discount (%)
          <input
            name="maxDiscountPercent"
            type="number"
            min="1"
            max="50"
            required
            defaultValue={settings.maxDiscountPercent}
          />
        </label>
      </div>
      <p className="form-note">
        1 point always equals 1 MKD of discount. Changes apply to new orders. Existing orders retain
        their earning rate; pausing does not erase balances or prevent pending points from settling.
      </p>
    </ApiForm>
  );
}

export function RewardGiftForm({
  products,
  gift,
}: {
  products: { id: string; name: string }[];
  gift?: { productId: string; points: number; enabled: boolean };
}) {
  return (
    <ApiForm
      endpoint="/api/admin/rewards/gifts"
      submit={gift ? 'Save gift' : 'Add gift'}
      refresh
      transform={(v) => ({
        productId: v.productId,
        points: Number(v.points),
        enabled: v.enabled === 'on',
      })}
    >
      <label>
        Product
        <select name="productId" required defaultValue={gift?.productId || ''}>
          <option value="" disabled>
            Choose a product
          </option>
          {products.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Point cost
        <input
          name="points"
          type="number"
          min="1"
          max="1000000"
          required
          defaultValue={gift?.points}
        />
      </label>
      <label className="checkbox">
        <input name="enabled" type="checkbox" defaultChecked={gift?.enabled ?? true} />
        Available as a reward
      </label>
    </ApiForm>
  );
}

export function PointsAdjustmentForm({ userId }: { userId: string }) {
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  return (
    <ApiForm
      endpoint="/api/admin/rewards/adjust"
      submit="Adjust points"
      refresh
      transform={(v) => {
        const fingerprint = JSON.stringify(v);
        if (request.current?.fingerprint !== fingerprint)
          request.current = { fingerprint, key: crypto.randomUUID() };
        return {
          userId,
          points: Number(v.points),
          reason: v.reason,
          idempotencyKey: request.current.key,
        };
      }}
    >
      <label>
        Points to add or subtract
        <input
          name="points"
          type="number"
          required
          min="-1000000"
          max="1000000"
          placeholder="100 or -100"
        />
      </label>
      <label>
        Reason (visible to the customer)
        <input name="reason" required maxLength={500} />
      </label>
      <p className="form-note">
        Repeating the same adjustment in this form is safe. Reload before intentionally making an
        identical adjustment again.
      </p>
    </ApiForm>
  );
}

export function OrderRewardsControls({
  order,
  hasRewards = true,
}: {
  hasRewards?: boolean;
  order: {
    id: string;
    status: string;
    paid: boolean;
    subtotal: number;
    rewardDiscount: number;
    giftPoints: number;
    refundedProducts: number;
    giftReturned: boolean;
  };
}) {
  if (order.status !== 'DELIVERED')
    return (
      <p className="form-note">
        Mark the order delivered before confirming payment
        {hasRewards ? ' and releasing points' : ''}.
      </p>
    );
  if (!order.paid)
    return (
      <ActionButton
        endpoint={`/api/admin/rewards/${order.id}/payment`}
        confirm={`Confirm you have received this payment?${hasRewards ? " This releases the customer's earned points." : ' The sale will count toward paid revenue.'}`}
      >
        Confirm payment received
      </ActionButton>
    );
  return (
    <div className="stack">
      <p className="success-text">
        Payment confirmed.
        {hasRewards
          ? ' Earned points have been released.'
          : ' This sale is included in paid revenue.'}
      </p>
      <details>
        <summary>Record a return / refund</summary>
        <ApiForm
          endpoint={`/api/admin/rewards/${order.id}/return`}
          submit={hasRewards ? 'Record return and adjust points' : 'Record product refund'}
          refresh
          transform={(v) => ({
            refundedProducts: Number(v.refundedProducts),
            giftReturned: v.giftReturned === 'on',
            reason: v.reason,
          })}
        >
          <label>
            Total product money refunded so far · MKD
            <input
              name="refundedProducts"
              type="number"
              required
              min={order.refundedProducts}
              max={order.subtotal - order.rewardDiscount}
              defaultValue={order.refundedProducts}
            />
          </label>
          {!!order.giftPoints && (
            <label className="checkbox">
              <input name="giftReturned" type="checkbox" defaultChecked={order.giftReturned} />
              Reward gift has also been returned
            </label>
          )}
          <label>
            Return reason
            <input name="reason" maxLength={500} required />
          </label>
          <p className="form-note">
            Enter the cumulative product refund, excluding delivery. This records your offline
            refund and adjusts points; it does not send money or restock items. Update physical
            stock separately after inspection. Refund totals cannot decrease.
          </p>
        </ApiForm>
      </details>
    </div>
  );
}

import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { rewardsSettings, giftProductInclude, eligibleGift } from '@/lib/rewards';
import { AdminHeading } from '@/components/admin-shared';
import { RewardGiftForm, RewardsSettingsForm } from '@/components/rewards-admin-forms';

export default async function RewardsAdmin() {
  await requireAdminPage();
  const [settings, gifts, products] = await Promise.all([
    rewardsSettings(),
    db.rewardGift.findMany({
      include: { product: { include: giftProductInclude } },
      orderBy: { points: 'asc' },
    }),
    db.product.findMany({
      where: { published: true },
      include: giftProductInclude,
      orderBy: { name: 'asc' },
    }),
  ]);
  const eligible = products.filter(eligibleGift);
  return (
    <>
      <AdminHeading
        title="GrandX Rewards"
        sub="One balance. Discounts and printed gifts. You control the rules."
      />
      <div className="two-column">
        <section className="panel">
          <h2>Points & discounts</h2>
          <RewardsSettingsForm settings={settings} />
        </section>
        <section className="panel">
          <h2>Add a printed gift</h2>
          <p className="form-note">
            Choose an available product without variants or required options. Customers can claim
            one gift with a paid order. Gifts use normal product stock and cannot increase the free
            delivery threshold.
          </p>
          {eligible.length ? (
            <RewardGiftForm products={eligible.map(({ id, name }) => ({ id, name }))} />
          ) : (
            <p>Publish an eligible product to offer your first gift.</p>
          )}
        </section>
      </div>
      <h2 className="editor-section">Your gift collection</h2>
      <div className="rewards-grid">
        {gifts.map((gift) => (
          <section className="panel" key={gift.id}>
            <h3>{gift.product.name}</h3>
            <p className="status-pill">
              {gift.enabled && eligibleGift(gift.product) ? 'AVAILABLE' : 'HIDDEN FROM CUSTOMERS'}
            </p>
            <RewardGiftForm
              products={[{ id: gift.productId, name: gift.product.name }]}
              gift={gift}
            />
          </section>
        ))}
        {!gifts.length && (
          <p className="muted">No gifts selected yet. Add your first product above.</p>
        )}
      </div>
      <section className="panel editor-section">
        <h2>Managing customer rewards</h2>
        <p>
          Open a customer to view their balance and history or add bonus points. On each delivered
          order, confirm cash payment to release earned points. Cancellation restores spent points
          automatically. Record partial or full returns on the order to reverse earnings and restore
          the corresponding discount points; gift points return only when the gift is returned.
        </p>
      </section>
    </>
  );
}

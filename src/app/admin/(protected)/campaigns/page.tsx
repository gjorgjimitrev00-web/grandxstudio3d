import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { getBlackFriday } from '@/lib/campaigns';
import { campaignStatus } from '@/lib/campaign-rules';
import { AdminHeading } from '@/components/admin-shared';
import { CampaignForm, StopCampaign } from '@/components/campaign-form';

export default async function Campaigns() {
  await requireAdminPage();
  const [campaign, products, categories] = await Promise.all([
    getBlackFriday(),
    db.product.findMany({
      select: { id: true, name: true, published: true },
      orderBy: { name: 'asc' },
    }),
    db.category.findMany({
      select: { id: true, name: true, enabled: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);
  const status = campaignStatus(campaign);
  const labels = { off: 'Исклучена', scheduled: 'Закажана', active: 'Активна', ended: 'Завршена' };
  return (
    <>
      <AdminHeading title="Кампањи" sub="Сезонски понуди што ги вклучуваш кога ти одговара." />
      <section className="panel stack">
        <div className="seasonal-panel">
          <div>
            <p className="eyebrow">Промотивен модул</p>
            <h2>Black Friday</h2>
            <p className="muted">
              Статус: <strong>{labels[status]}</strong> · Europe/Skopje
            </p>
          </div>
          {campaign.enabled && <StopCampaign />}
        </div>
        <CampaignForm
          key={JSON.stringify(campaign)}
          campaign={campaign}
          products={products}
          categories={categories}
        />
      </section>
    </>
  );
}

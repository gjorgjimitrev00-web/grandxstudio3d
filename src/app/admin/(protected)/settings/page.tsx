import { requireAdminPage } from '@/lib/admin-access';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { serialize } from '@/lib/utils';
import { AdminHeading } from '@/components/admin-shared';
import { SettingsForm, ShippingForm } from '@/components/admin-forms';
export default async function Settings() {
  await requireAdminPage();
  const [s, methods] = await Promise.all([
    getSettings(),
    db.shippingMethod.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);
  return (
    <>
      <AdminHeading
        title="Store settings"
        sub="Your business details, delivery options, and editable pages."
      />
      <div className="notice">
        Legal pages contain templates that require your review before launch. Set your real contact
        details and pickup address before enabling pickup.
      </div>
      <section className="panel editor-section">
        <h2>Business & pages</h2>
        <SettingsForm settings={s} />
      </section>
      <section className="admin-section">
        <h2>Delivery · North Macedonia</h2>
        {methods.map((m) => (
          <div className="panel editor-section" key={m.id}>
            <h2>{m.name}</h2>
            <ShippingForm method={serialize(m)} />
          </div>
        ))}
        <div className="panel editor-section">
          <details>
            <summary>+ Add shipping method</summary>
            <ShippingForm />
          </details>
        </div>
      </section>
    </>
  );
}

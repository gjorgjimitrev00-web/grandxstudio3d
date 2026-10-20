'use client';
import { ApiForm } from './api-form';
export function VisitorSettings({ enabled }: { enabled: boolean }) {
  return (
    <ApiForm
      endpoint="/api/admin/analytics/settings"
      method="PUT"
      submit="Save tracking setting"
      refresh
      transform={(data) => ({ enabled: data.enabled === 'on' })}
    >
      <label className="checkbox">
        <input name="enabled" type="checkbox" defaultChecked={enabled} /> Count storefront visitors
      </label>
      <p className="form-note">
        Pausing stops new measurements. Existing records expire after 35 days.
      </p>
    </ApiForm>
  );
}

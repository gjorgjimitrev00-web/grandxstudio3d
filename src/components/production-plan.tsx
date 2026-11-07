'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api-form';

type Plan = {
  productionDue: string | null;
  productionStation: string | null;
  productionMaterial: string | null;
};
export function ProductionPlan({
  kind,
  id,
  expected,
  stationOptions,
  material,
}: {
  kind: string;
  id: string;
  expected: Plan;
  stationOptions: [string, string][];
  material: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <details className="queue-plan">
      <summary>Schedule or assign</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const get = (key: string) => String(data.get(key) || '').trim() || null;
          setBusy(true);
          setMessage('');
          try {
            await api('/api/admin/production/' + kind + '/' + id, 'PATCH', {
              expected,
              plan: {
                productionDue: get('due'),
                productionStation: get('station'),
                productionMaterial: get('material'),
              },
            });
            setMessage('Plan saved.');
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Could not save the plan.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Due date
          <input type="date" name="due" defaultValue={expected.productionDue || ''} />
        </label>
        <label>
          Station
          <select name="station" defaultValue={expected.productionStation || ''}>
            <option value="">Automatic</option>
            {stationOptions.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Material or paper
          <input
            name="material"
            maxLength={120}
            defaultValue={expected.productionMaterial || ''}
            placeholder={material || 'e.g. ivory PLA'}
          />
        </label>
        <button disabled={busy} className="button outline" type="submit">
          Save plan
        </button>
        <span role="status">{message}</span>
      </form>
    </details>
  );
}

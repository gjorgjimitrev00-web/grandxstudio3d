'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api-form';
import { occasions, recipients, type GiftTags } from '@/lib/gift-finder';
export function GiftTagEditor({
  id,
  initial,
  custom,
}: {
  id: string;
  initial: GiftTags;
  custom: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(next: GiftTags | null) {
    setBusy(true);
    setMessage('');
    try {
      await api('/api/admin/gift-finder/' + id, 'PUT', { expected: custom ? initial : null, next });
      setMessage('Saved.');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary className="text-link">Edit matches</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          void save({
            occasions: fields.getAll('occasions').map(String) as GiftTags['occasions'],
            recipients: fields.getAll('recipients').map(String) as GiftTags['recipients'],
          });
        }}
      >
        <fieldset disabled={busy}>
          <legend>Occasions</legend>
          {Object.entries(occasions).map(([k, l]) => (
            <label key={k} className="checkbox">
              <input
                type="checkbox"
                name="occasions"
                value={k}
                defaultChecked={(initial.occasions as string[]).includes(k)}
              />
              {l[1]}
            </label>
          ))}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Recipients</legend>
          {Object.entries(recipients).map(([k, l]) => (
            <label key={k} className="checkbox">
              <input
                type="checkbox"
                name="recipients"
                value={k}
                defaultChecked={(initial.recipients as string[]).includes(k)}
              />
              {l[1]}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button className="button outline" disabled={busy}>
            Save matches
          </button>
          {custom && (
            <button
              className="text-link"
              disabled={busy}
              type="button"
              onClick={() => void save(null)}
            >
              Use automatic matches
            </button>
          )}
        </div>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}

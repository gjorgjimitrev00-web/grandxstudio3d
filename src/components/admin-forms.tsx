'use client';
import type { Category, ShippingMethod } from '@prisma/client';
import { ApiForm, ActionButton } from './api-form';
export function CategoryForm({ category: c }: { category?: Category }) {
  return (
    <div className="stack">
      <ApiForm
        endpoint={`/api/admin/categories${c ? '/' + c.id : ''}`}
        method={c ? 'PUT' : 'POST'}
        submit={c ? 'Save category' : 'Create category'}
        refresh
        transform={(v) => ({ ...v, sortOrder: Number(v.sortOrder), enabled: v.enabled === 'on' })}
      >
        <div className="form-grid">
          <label>
            Name
            <input name="name" defaultValue={c?.name} required />
          </label>
          <label>
            Slug
            <input name="slug" defaultValue={c?.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </label>
          <label className="span-2">
            Description
            <textarea name="description" defaultValue={c?.description} />
          </label>
          <label>
            Sort order
            <input
              name="sortOrder"
              type="number"
              defaultValue={c?.sortOrder || 0}
              min="0"
              required
            />
          </label>
          <label className="checkbox">
            <input name="enabled" type="checkbox" defaultChecked={c?.enabled ?? true} />
            Enabled
          </label>
        </div>
      </ApiForm>
      {c && (
        <>
          <ApiForm
            endpoint={`/api/admin/categories/${c.id}/image`}
            multipart
            submit="Upload category image"
            refresh
          >
            {c.image && <img className="category-admin-image" src={c.image} alt={c.name} />}
            <label>
              Image
              <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
            </label>
          </ApiForm>
          <ActionButton
            endpoint={`/api/admin/categories/${c.id}`}
            method="DELETE"
            confirm="Delete this category? Products must be removed from it first."
          >
            Delete category
          </ActionButton>
        </>
      )}
    </div>
  );
}
export function StatusForm({
  endpoint,
  status,
  allowed,
  notes,
}: {
  endpoint: string;
  status: string;
  allowed: string[];
  notes: string | null;
}) {
  return (
    <ApiForm endpoint={endpoint} method="PATCH" refresh submit="Save changes">
      <label>
        Status
        <select name="status" defaultValue={status}>
          {Array.from(new Set([status, ...allowed])).map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Internal notes
        <textarea name="internalNotes" defaultValue={notes || ''} maxLength={10000} />
      </label>
    </ApiForm>
  );
}
export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const keys = [
    'storeName',
    'tagline',
    'logo',
    'email',
    'phone',
    'address',
    'instagram',
    'facebook',
    'tiktok',
    'currency',
  ];
  return (
    <ApiForm endpoint="/api/admin/settings" method="PUT" refresh submit="Save store settings">
      <div className="form-grid">
        {keys.map((key) => (
          <label key={key}>
            {key.replace(/([A-Z])/g, ' $1')}
            <input
              name={key}
              defaultValue={settings[key]}
              readOnly={key === 'currency'}
              type={
                key === 'email'
                  ? 'email'
                  : ['instagram', 'facebook', 'tiktok', 'logo'].includes(key)
                    ? 'url'
                    : 'text'
              }
            />
          </label>
        ))}
        {['about', 'terms', 'privacy', 'shipping', 'returns'].map((key) => (
          <label className="span-2" key={key}>
            {key} — editable page content
            <textarea
              name={key}
              className="large-textarea"
              maxLength={20000}
              defaultValue={settings[key]}
            />
          </label>
        ))}
      </div>
    </ApiForm>
  );
}
export function ShippingForm({ method: m }: { method?: ShippingMethod }) {
  return (
    <ApiForm
      endpoint={`/api/admin/shipping${m ? '/' + m.id : ''}`}
      method={m ? 'PUT' : 'POST'}
      refresh
      submit={m ? 'Save shipping method' : 'Add shipping method'}
      transform={(v) => ({
        ...v,
        price: Number(v.price),
        freeThreshold: v.freeThreshold === '' ? null : Number(v.freeThreshold),
        enabled: v.enabled === 'on',
      })}
    >
      <div className="form-grid">
        <label>
          Name
          <input name="name" defaultValue={m?.name} required />
        </label>
        <label>
          Type
          <select name="kind" defaultValue={m?.kind || 'STANDARD'}>
            <option value="STANDARD">Standard delivery</option>
            <option value="FREE">Free delivery</option>
            <option value="PICKUP">Local pickup</option>
          </select>
        </label>
        <label>
          Price · MKD
          <input name="price" type="number" min="0" defaultValue={m?.price || 0} required />
        </label>
        <label>
          Free shipping threshold · MKD
          <input name="freeThreshold" type="number" min="0" defaultValue={m?.freeThreshold ?? ''} />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="enabled" defaultChecked={m?.enabled ?? true} />
          Enabled
        </label>
      </div>
    </ApiForm>
  );
}

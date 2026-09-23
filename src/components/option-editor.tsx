'use client';
import { useState } from 'react';
import { ApiForm, ActionButton } from './api-form';
type Option = {
  id: string;
  name: string;
  kind: string;
  required: boolean;
  values: { id: string; value: string; swatch: string | null }[];
};
export function OptionEditor({ option: o, productId }: { option: Option; productId: string }) {
  const [values, setValues] = useState<{ id?: string; value: string; swatch: string | null }[]>(
    o.values,
  );
  return (
    <details className="option-editor">
      <summary>
        <b>{o.name}</b>
        <p className="small muted">
          {o.kind} · {o.required ? 'Required' : 'Optional'} ·{' '}
          {o.values.map((v) => v.value).join(', ')}
        </p>
      </summary>
      <ApiForm
        endpoint={`/api/admin/products/${productId}/options/${o.id}`}
        method="PUT"
        refresh
        submit="Save option"
        transform={(v) => ({
          name: v.name,
          required: v.required === 'on',
          values: values.map((v) => ({ ...v, swatch: v.swatch || null })),
        })}
      >
        <label>
          Option name
          <input name="name" required defaultValue={o.name} />
        </label>
        <label className="checkbox">
          <input name="required" type="checkbox" defaultChecked={o.required} />
          Required
        </label>
        {o.kind === 'SELECT' && (
          <>
            <div className="stack">
              {values.map((v, i) => (
                <div className="option-value-row" key={v.id || `new-${i}`}>
                  <label>
                    Value
                    <input
                      required
                      value={v.value}
                      onChange={(e) =>
                        setValues(
                          values.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <label>
                    Hex colour (optional)
                    <input
                      value={v.swatch || ''}
                      pattern="#[0-9a-fA-F]{6}"
                      placeholder="#2255bb"
                      onChange={(e) =>
                        setValues(
                          values.map((x, n) => (n === i ? { ...x, swatch: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => setValues(values.filter((_, n) => n !== i))}
                  >
                    Remove value
                  </button>
                </div>
              ))}
            </div>
            <button
              className="text-link"
              type="button"
              onClick={() => setValues([...values, { value: '', swatch: null }])}
            >
              + Add colour / size / choice
            </button>
          </>
        )}
      </ApiForm>
      <div className="editor-section">
        <ActionButton
          method="DELETE"
          endpoint={`/api/admin/products/${productId}/options/${o.id}`}
          confirm="Remove this option?"
        >
          Delete option
        </ActionButton>
      </div>
    </details>
  );
}

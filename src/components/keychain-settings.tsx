'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api-form';
import { colorHex, supportsKeychainColor, type PreviewOption } from '@/lib/keychain-preview';

export function KeychainSettings({
  productId,
  options,
}: {
  productId: string;
  options: PreviewOption[];
}) {
  const router = useRouter();
  const configuredText = options.find((o) => o.keychainRole === 'NAME');
  const configuredColor = options.find((o) => o.keychainRole === 'COLOR');
  const texts = options.filter((o) => o.required && o.kind === 'TEXT');
  const colors = options.filter(supportsKeychainColor);
  const [enabled, setEnabled] = useState(Boolean(configuredText && configuredColor));
  const [nameOptionId, setNameOptionId] = useState(configuredText?.id ?? texts[0]?.id ?? 'new');
  const [colorOptionId, setColorOptionId] = useState(configuredColor?.id ?? colors[0]?.id ?? 'new');
  const [swatches, setSwatches] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <section className="panel editor-section">
      <h2>Name keychain preview</h2>
      <form
        className="stack"
        onChange={() => {
          setSaved(false);
          setError('');
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          setSaved(false);
          try {
            const palette =
              enabled && colorOptionId === 'new'
                ? swatches
                    .split('\n')
                    .filter((line) => line.trim())
                    .map((line) => {
                      const i = line.lastIndexOf(':');
                      const value = line.slice(0, i).trim();
                      const swatch = line.slice(i + 1).trim();
                      if (i < 1 || !value || !colorHex.test(swatch))
                        throw new Error('Use Color name:#112233 on each line.');
                      return { value, swatch };
                    })
                : [];
            await api('/api/admin/products/' + productId + '/keychain-preview', 'PUT', {
              enabled,
              nameOptionId,
              colorOptionId,
              colors: palette,
            });
            setSaved(true);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="checkbox">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Show the live name and base color preview for this product
        </label>
        {enabled && (
          <>
            <div className="form-grid">
              <label>
                Name field
                <select value={nameOptionId} onChange={(e) => setNameOptionId(e.target.value)}>
                  {texts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  {!texts.length && <option value="new">Create a required name field</option>}
                </select>
              </label>
              <label>
                Base color field
                <select value={colorOptionId} onChange={(e) => setColorOptionId(e.target.value)}>
                  {colors.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  {!colors.length && <option value="new">Create a required color option</option>}
                </select>
              </label>
            </div>
            {colorOptionId === 'new' && (
              <label>
                Available colors, one name and hex swatch per line
                <textarea
                  required
                  rows={3}
                  placeholder={'Graphite:#30312e\nOrange:#fe7f2d'}
                  value={swatches}
                  onChange={(event) => setSwatches(event.target.value)}
                />
              </label>
            )}
            <p className="form-note">
              The customer approves up to 16 characters and one of your available colors before
              adding the keychain to their cart.
            </p>
          </>
        )}
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : 'Save keychain preview'}
        </button>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {saved && <p role="status">Preview settings saved.</p>}
      </form>
    </section>
  );
}

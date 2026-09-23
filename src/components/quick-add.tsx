'use client';
import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Copy } from '@/lib/i18n';
import type { DetailProduct } from './product-detail';
import { useCart } from './cart-context';
import { money } from '@/lib/utils';
import { api } from './api-form';
export function QuickAdd({ id, name, copy }: { id: string; name: string; copy: Copy }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [p, setProduct] = useState<DetailProduct | null>(null);
  const [variantId, setVariantId] = useState('');
  const [options, setOptions] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { add } = useCart();
  const v = p?.variants.find((v) => v.id === variantId);
  const price = p ? (v?.price ?? (p.salePrice ?? p.price) + (v?.priceAdjustment || 0)) : 0;
  const unavailable =
    p &&
    (p.inventoryMode === 'OUT_OF_STOCK' ||
      (p.trackInventory && (v?.stock ?? p.stock) < 1) ||
      (p.variants.length > 0 && !v));
  return (
    <>
      <button
        className="quick-add-trigger"
        aria-label={`${copy.add}: ${name}`}
        onClick={async () => {
          setBusy(true);
          setError('');
          dialog.current?.showModal();
          try {
            const product = await api(`/api/catalog/${id}`, 'GET');
            setProduct(product);
            setVariantId(
              product.variants.find(
                (v: DetailProduct['variants'][number]) =>
                  v.enabled && (!product.trackInventory || v.stock > 0),
              )?.id || '',
            );
            setOptions({});
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Plus size={15} />
        {copy.add}
      </button>
      <dialog className="quick-add-dialog" ref={dialog}>
        <div className="row between">
          <h2>{name}</h2>
          <button
            className="icon-button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        {busy ? (
          <p>{copy.loading}</p>
        ) : (
          p && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (unavailable) return;
                dialog.current?.close();
                add({
                  productId: p.id,
                  variantId: v?.id,
                  name: p.name,
                  slug: p.slug,
                  image: v?.image || p.images[0]?.url || '',
                  variantName: v?.name,
                  quantity: 1,
                  price,
                  options,
                });
              }}
            >
              <img
                className="quick-add-image"
                src={v?.image || p.images[0]?.url || '/favicon.svg'}
                alt={p.name}
              />
              <b>{money(price)}</b>
              {p.variants.length > 0 && (
                <label>
                  {copy.details}
                  <select required value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                    <option value="">Choose variant</option>
                    {p.variants
                      .filter((v) => v.enabled)
                      .map((v) => (
                        <option value={v.id} key={v.id} disabled={p.trackInventory && v.stock < 1}>
                          {v.name}
                          {p.trackInventory && v.stock < 1 ? ' — ' + copy.outOfStock : ''}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {p.options
                .filter((o) => !v?.values.some((x) => x.value.optionId === o.id))
                .map((o) => (
                  <label key={o.id}>
                    {o.name}
                    {o.kind === 'TEXT' ? (
                      <input
                        required={o.required}
                        maxLength={200}
                        value={options[o.id] || ''}
                        onChange={(e) => setOptions({ ...options, [o.id]: e.target.value })}
                      />
                    ) : (
                      <select
                        required={o.required}
                        value={options[o.id] || ''}
                        onChange={(e) => setOptions({ ...options, [o.id]: e.target.value })}
                      >
                        <option value="">Choose</option>
                        {o.values.map((v) => (
                          <option key={v.id} value={v.value}>
                            {v.value}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
              <button className="button" disabled={!!unavailable}>
                {unavailable ? copy.outOfStock : copy.add}
              </button>
            </form>
          )
        )}
        <p className="error-text" role="alert">
          {error}
        </p>
      </dialog>
    </>
  );
}

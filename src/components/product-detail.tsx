'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, ArrowUpRight, Truck, PackageCheck, ZoomIn, X, Layers3 } from 'lucide-react';
import type { Copy } from '@/lib/i18n';
import { money } from '@/lib/utils';
import { useCart } from './cart-context';
export type DetailProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  inventoryMode: string;
  trackInventory: boolean;
  stock: number;
  shortDescription: string;
  images: { id: string; url: string; altText: string }[];
  options: {
    id: string;
    name: string;
    kind: string;
    required: boolean;
    values: { id: string; value: string; swatch: string | null }[];
  }[];
  variants: {
    id: string;
    name: string;
    price: number | null;
    priceAdjustment: number;
    stock: number;
    enabled: boolean;
    image: string | null;
    values: { valueId: string; value: { optionId: string; value: string } }[];
  }[];
};
export function ProductDetail({ product: p, copy }: { product: DetailProduct; copy: Copy }) {
  const initial =
    p.variants.find((v) => v.enabled && (!p.trackInventory || v.stock > 0)) ||
    p.variants.find((v) => v.enabled);
  const [variantId, setVariant] = useState(initial?.id || '');
  const [options, setOptions] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [index, setIndex] = useState(0);
  const [imageOverride, setImageOverride] = useState(initial?.image || '');
  const [error, setError] = useState('');
  const zoom = useRef<HTMLDialogElement>(null);
  const { add } = useCart();
  const router = useRouter();
  const variant = p.variants.find((v) => v.id === variantId);
  const price = variant?.price ?? (p.salePrice ?? p.price) + (variant?.priceAdjustment || 0);
  const stock = variant?.stock ?? p.stock;
  const unavailable =
    p.inventoryMode === 'OUT_OF_STOCK' ||
    (p.trackInventory && stock < 1) ||
    (p.variants.length > 0 && !variant);
  const image = imageOverride || p.images[index]?.url || '/favicon.svg';
  function changeVariant(id: string) {
    setVariant(id);
    setImageOverride(p.variants.find((v) => v.id === id)?.image || '');
    setQty(1);
    setError('');
  }
  function selectValue(optionId: string, valueId: string) {
    const matching = p.variants.filter(
      (v) => v.enabled && v.values.some((x) => x.valueId === valueId),
    );
    const next =
      matching.find((v) =>
        variant?.values
          .filter((x) => x.value.optionId !== optionId)
          .every((x) => v.values.some((y) => y.valueId === x.valueId)),
      ) || matching[0];
    if (next) changeVariant(next.id);
    else setError(copy.outOfStock);
  }
  function addItem(buy = false) {
    setError('');
    for (const o of p.options) {
      if (o.required && !variant?.values.some((v) => v.value.optionId === o.id) && !options[o.id]) {
        setError(`${o.name}: required`);
        return;
      }
    }
    add(
      {
        productId: p.id,
        variantId: variant?.id,
        name: p.name,
        slug: p.slug,
        image,
        variantName: variant?.name,
        quantity: qty,
        price,
        options,
      },
      !buy,
    );
    if (buy) router.push('/checkout');
  }
  return (
    <div className="product-detail">
      <div>
        <button
          className="gallery-main"
          aria-label="Zoom image"
          onClick={() => zoom.current?.showModal()}
        >
          <img src={image} alt={p.images[index]?.altText || p.name} />
          <span>
            <ZoomIn size={19} />
          </span>
        </button>
        <div className="gallery-thumbnails">
          {p.images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => {
                setIndex(i);
                setImageOverride('');
              }}
              className={index === i ? 'selected' : ''}
              aria-label={`Image ${i + 1}`}
            >
              <img src={img.url} alt={img.altText} />
            </button>
          ))}
        </div>
        <dialog ref={zoom} className="image-zoom">
          <button
            className="icon-button"
            aria-label="Close zoom"
            onClick={() => zoom.current?.close()}
          >
            <X />
          </button>
          <img src={image} alt={p.name} />
        </dialog>
      </div>
      <div className="product-purchase">
        <p className="eyebrow orange">DESIGNED & PRINTED BY GRANDXSTUDIO</p>
        <h1 className="page-title">{p.name}</h1>
        <div className="row">
          <strong className="detail-price">{money(price)}</strong>
          {p.salePrice !== null && variant?.price == null && (
            <del className="muted">{money(p.price + (variant?.priceAdjustment || 0))}</del>
          )}
        </div>
        <p className={`stock-label ${unavailable ? 'unavailable' : ''}`}>
          <Layers3 size={15} />
          {unavailable
            ? copy.outOfStock
            : p.inventoryMode === 'MADE_TO_ORDER'
              ? copy.madeToOrder
              : copy.inStock}
        </p>
        <p className="muted product-short">{p.shortDescription}</p>
        <div className="stack">
          {p.options.map((o) => (
            <fieldset key={o.id}>
              <legend>
                {o.name}
                {o.required ? ' *' : ''}
              </legend>
              {o.kind === 'TEXT' ? (
                <input
                  aria-label={o.name}
                  maxLength={200}
                  required={o.required}
                  value={options[o.id] || ''}
                  onChange={(e) => setOptions({ ...options, [o.id]: e.target.value })}
                />
              ) : (
                <div className="swatches">
                  {o.values.map((v) => {
                    const isVariant = p.variants.some((variant) =>
                      variant.values.some((x) => x.valueId === v.id),
                    );
                    const selected =
                      variant?.values.some((x) => x.valueId === v.id) || options[o.id] === v.value;
                    return (
                      <button
                        key={v.id}
                        className={`swatch ${selected ? 'selected' : ''}`}
                        aria-label={`${o.name}: ${v.value}`}
                        aria-pressed={selected}
                        title={v.value}
                        onClick={() =>
                          isVariant
                            ? selectValue(o.id, v.id)
                            : setOptions({ ...options, [o.id]: v.value })
                        }
                      >
                        {v.swatch && <span style={{ background: v.swatch }} />}
                        {v.value}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
          {p.variants.length > 0 && (
            <label>
              Version / {copy.details}
              <select value={variantId} onChange={(e) => changeVariant(e.target.value)}>
                {p.variants
                  .filter((v) => v.enabled)
                  .map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.name}
                      {p.trackInventory && v.stock === 0 ? ' — ' + copy.outOfStock : ''}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="row">
            <div className="quantity">
              <button aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}>
                <Minus size={15} />
              </button>
              <span>{qty}</span>
              <button
                aria-label="Increase quantity"
                onClick={() => setQty(Math.min(p.trackInventory ? stock : 99, qty + 1))}
              >
                <Plus size={15} />
              </button>
            </div>
            <button className="button full" disabled={unavailable} onClick={() => addItem()}>
              {copy.add}
              <ArrowUpRight size={19} />
            </button>
          </div>
          <button
            className="button outline full"
            disabled={unavailable}
            onClick={() => addItem(true)}
          >
            {copy.buyNow}
          </button>
          <p role="alert" className="error-text">
            {error}
          </p>
        </div>
        <div className="product-promises">
          <p>
            <Truck size={17} />
            {copy.shipping} · {copy.country}
          </p>
          <p>
            <PackageCheck size={17} />
            {copy.cod}
          </p>
        </div>
      </div>
    </div>
  );
}

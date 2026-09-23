'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { api, ActionButton, ApiForm } from './api-form';
import { OptionEditor } from './option-editor';
type Product = Prisma.ProductGetPayload<{
  include: {
    categories: true;
    specifications: true;
    images: true;
    options: { include: { values: true } };
    variants: { include: { values: true } };
  };
}>;
type Category = { id: string; name: string };
export function ProductEditor({
  product: p,
  categories,
}: {
  product?: Product;
  categories: Category[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  return (
    <>
      <form
        className="editor-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage('');
          const fd = new FormData(e.currentTarget);
          const v = Object.fromEntries(fd);
          const data = {
            ...v,
            price: Number(v.price),
            salePrice: v.salePrice === '' ? null : Number(v.salePrice),
            stock: Number(v.stock),
            lowStockThreshold: Number(v.lowStockThreshold),
            published: fd.has('published'),
            featured: fd.has('featured'),
            bestseller: fd.has('bestseller'),
            isNew: fd.has('isNew'),
            trackInventory: fd.has('trackInventory'),
            categoryIds: fd.getAll('categoryIds'),
            specifications: String(v.specifications)
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const i = line.indexOf(':');
                return {
                  label: i === -1 ? line : line.slice(0, i).trim(),
                  value: i === -1 ? '—' : line.slice(i + 1).trim(),
                };
              }),
          };
          try {
            const result = await api(
              `/api/admin/products${p ? '/' + p.id : ''}`,
              p ? 'PUT' : 'POST',
              data,
            );
            setMessage('Product saved.');
            if (!p) router.push(`/admin/products/${result.id}`);
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Save failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="stack">
          <section className="panel">
            <h2>Product details</h2>
            <div className="form-grid">
              <label className="span-2">
                Name
                <input name="name" required defaultValue={p?.name} maxLength={150} />
              </label>
              <label>
                URL slug
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  defaultValue={p?.slug}
                  maxLength={180}
                  placeholder="ps5-controller-holder"
                />
              </label>
              <label>
                SKU
                <input name="sku" required defaultValue={p?.sku} maxLength={100} />
              </label>
              <label className="span-2">
                Short description
                <textarea
                  name="shortDescription"
                  defaultValue={p?.shortDescription}
                  required
                  maxLength={1000}
                />
              </label>
              <label className="span-2">
                Full description
                <textarea
                  className="large-textarea"
                  name="description"
                  defaultValue={p?.description}
                  required
                  maxLength={20000}
                />
              </label>
              <label className="span-2">
                Specifications — one “Label: Value” per line
                <textarea
                  name="specifications"
                  defaultValue={p?.specifications.map((s) => `${s.label}: ${s.value}`).join('\n')}
                />
              </label>
            </div>
          </section>
          <section className="panel">
            <h2>Search appearance</h2>
            <div className="stack">
              <label>
                SEO title
                <input name="seoTitle" defaultValue={p?.seoTitle || ''} maxLength={150} />
              </label>
              <label>
                SEO description
                <textarea
                  name="seoDescription"
                  defaultValue={p?.seoDescription || ''}
                  maxLength={500}
                />
              </label>
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h2>Pricing · MKD</h2>
            <div className="form-grid">
              <label>
                Price
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={p?.price || 0}
                />
              </label>
              <label>
                Sale price
                <input
                  name="salePrice"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={p?.salePrice ?? ''}
                />
              </label>
            </div>
          </section>
          <section className="panel">
            <h2>Inventory</h2>
            <div className="stack">
              <label>
                Mode
                <select name="inventoryMode" defaultValue={p?.inventoryMode || 'MADE_TO_ORDER'}>
                  <option value="IN_STOCK">In stock</option>
                  <option value="MADE_TO_ORDER">Made to order</option>
                  <option value="OUT_OF_STOCK">Out of stock</option>
                </select>
              </label>
              <label className="checkbox">
                <input name="trackInventory" type="checkbox" defaultChecked={p?.trackInventory} />
                Track and reduce inventory
              </label>
              <div className="form-grid">
                <label>
                  Stock
                  <input name="stock" type="number" min="0" defaultValue={p?.stock || 0} required />
                </label>
                <label>
                  Low stock at
                  <input
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    defaultValue={p?.lowStockThreshold ?? 3}
                    required
                  />
                </label>
              </div>
              <p className="form-note">
                Products with variants use each variant’s stock. Made to order can be sold without
                tracking stock.
              </p>
            </div>
          </section>
          <section className="panel">
            <h2>Collections & visibility</h2>
            <div className="stack">
              {categories.map((c) => (
                <label className="checkbox" key={c.id}>
                  <input
                    name="categoryIds"
                    value={c.id}
                    type="checkbox"
                    defaultChecked={p?.categories.some((x) => x.categoryId === c.id)}
                  />
                  {c.name}
                </label>
              ))}
              <hr />
              {[
                ['published', 'Published'],
                ['featured', 'Featured'],
                ['bestseller', 'Bestseller'],
                ['isNew', 'New arrival'],
              ].map(([name, label]) => (
                <label key={name} className="checkbox">
                  <input
                    name={name}
                    type="checkbox"
                    defaultChecked={p?.[name as 'published' | 'featured' | 'bestseller' | 'isNew']}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
          <p role="status" className="form-note">
            {message}
          </p>
          <button disabled={busy} className="button full">
            {busy ? 'Saving…' : 'Save product'}
          </button>
          {p && (
            <>
              <Link className="text-link" href={`/product/${p.slug}`} target="_blank">
                View published product ↗
              </Link>
              <ActionButton
                endpoint={`/api/admin/products/${p.id}`}
                method="DELETE"
                confirm="Delete this product? Past order snapshots are kept. This cannot be undone."
                redirect="/admin/products"
              >
                Delete product
              </ActionButton>
            </>
          )}
        </div>
      </form>
      {p ? (
        <>
          <ImageManager product={p} />
          <section className="panel editor-section">
            <h2>Options</h2>
            <p className="form-note">
              Define colours, sizes, or materials before creating variants. Text options collect
              personalization from the customer.
            </p>
            <div className="option-list">
              {p.options.map((o) => (
                <OptionEditor key={o.id + JSON.stringify(o.values)} option={o} productId={p.id} />
              ))}
            </div>
            <ApiForm
              endpoint={`/api/admin/products/${p.id}/options`}
              submit="Add option"
              refresh
              transform={(v) => ({
                name: v.name,
                kind: v.kind,
                required: v.required === 'on',
                values: String(v.values)
                  .split(',')
                  .filter((v) => v.trim())
                  .map((item) => {
                    const [value, swatch] = item.trim().split(':');
                    return { value: value.trim(), ...(swatch ? { swatch: swatch.trim() } : {}) };
                  }),
              })}
            >
              <div className="form-grid">
                <label>
                  Option name
                  <input name="name" required placeholder="Color" />
                </label>
                <label>
                  Type
                  <select name="kind">
                    <option value="SELECT">Choice</option>
                    <option value="TEXT">Personalized text</option>
                  </select>
                </label>
                <label className="span-2">
                  Choice values, comma separated (optional hex colour after colon)
                  <input name="values" placeholder="Black:#222222, White:#ffffff, Blue:#2648bc" />
                </label>
                <label className="checkbox">
                  <input name="required" type="checkbox" defaultChecked />
                  Required
                </label>
              </div>
            </ApiForm>
          </section>
          <section className="panel editor-section">
            <h2>Variants</h2>
            <p className="form-note">
              Each variant has an independent SKU and stock. An explicit price overrides the
              product’s price; otherwise the adjustment is added.
            </p>
            {p.variants.map((v) => (
              <details className="variant-details" key={v.id}>
                <summary>
                  {v.name} · {v.sku} · {v.stock} units · {v.enabled ? 'Enabled' : 'Disabled'}
                </summary>
                <VariantForm product={p} variant={v} />
              </details>
            ))}
            <details className="variant-details" open={!p.variants.length}>
              <summary>+ Add variant</summary>
              <VariantForm product={p} />
            </details>
          </section>
        </>
      ) : (
        <div className="notice editor-section">
          Save the product first to add images, options, and variants.
        </div>
      )}
    </>
  );
}
function VariantForm({
  product: p,
  variant: v,
}: {
  product: Product;
  variant?: Product['variants'][number];
}) {
  return (
    <>
      <ApiForm
        endpoint={`/api/admin/products/${p.id}/variants${v ? '/' + v.id : ''}`}
        method={v ? 'PUT' : 'POST'}
        submit={v ? 'Save variant' : 'Create variant'}
        refresh
        transform={(data) => ({
          name: data.name,
          sku: data.sku,
          price: data.price === '' ? null : Number(data.price),
          priceAdjustment: Number(data.priceAdjustment),
          stock: Number(data.stock),
          enabled: data.enabled === 'on',
          image: String(data.image || ''),
          valueIds: Object.entries(data)
            .filter(([key, value]) => key.startsWith('option-') && value)
            .map(([, value]) => value),
        })}
      >
        <div className="form-grid">
          <label>
            Name
            <input name="name" required defaultValue={v?.name} />
          </label>
          <label>
            SKU
            <input name="sku" required defaultValue={v?.sku} />
          </label>
          <label>
            Price override
            <input name="price" type="number" min="0" defaultValue={v?.price ?? ''} />
          </label>
          <label>
            Price adjustment
            <input name="priceAdjustment" type="number" defaultValue={v?.priceAdjustment || 0} />
          </label>
          <label>
            Stock
            <input name="stock" type="number" min="0" defaultValue={v?.stock || 0} />
          </label>
          <label className="checkbox">
            <input name="enabled" type="checkbox" defaultChecked={v?.enabled ?? true} />
            Enabled
          </label>
          {p.options
            .filter((o) => o.kind === 'SELECT')
            .map((o) => (
              <label key={o.id}>
                {o.name}
                <select
                  name={`option-${o.id}`}
                  required={o.required}
                  defaultValue={
                    v?.values.find((x) => o.values.some((y) => y.id === x.valueId))?.valueId || ''
                  }
                >
                  <option value="">Choose value</option>
                  {o.values.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <label className="span-2">
            Variant image
            <select name="image" defaultValue={v?.image || ''}>
              <option value="">Use product gallery</option>
              {p.images.map((i) => (
                <option key={i.id} value={i.url}>
                  {i.altText || i.filename}
                </option>
              ))}
            </select>
          </label>
        </div>
      </ApiForm>
      {v && (
        <ActionButton
          endpoint={`/api/admin/products/${p.id}/variants/${v.id}`}
          method="DELETE"
          confirm="Delete this variant? Disable it instead if it has active orders."
        >
          Delete variant
        </ActionButton>
      )}
    </>
  );
}
function ImageManager({ product: p }: { product: Product }) {
  const [images, setImages] = useState(p.images);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => setImages(p.images), [p.images]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  async function save() {
    setBusy(true);
    try {
      await api(
        `/api/admin/products/${p.id}/images`,
        'PATCH',
        images.map((i, sortOrder) => ({
          id: i.id,
          altText: i.altText,
          isPrimary: i.isPrimary,
          sortOrder,
        })),
      );
      setMessage('Image order saved.');
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel editor-section">
      <h2>Product images</h2>
      <p className="form-note">
        JPEG, PNG, WebP · 10 MB each · up to 3 images per upload. Images are converted to WebP at
        400, 800, and 1600 px.
      </p>
      <div className="image-manager">
        {images.map((img, i) => (
          <article key={img.id}>
            <img src={img.thumbnailUrl} alt={img.altText} />
            <label>
              Alt text
              <input
                value={img.altText}
                maxLength={200}
                onChange={(e) =>
                  setImages(
                    images.map((x) => (x.id === img.id ? { ...x, altText: e.target.value } : x)),
                  )
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="primary"
                checked={img.isPrimary}
                onChange={() =>
                  setImages(images.map((x) => ({ ...x, isPrimary: x.id === img.id })))
                }
              />
              Primary
            </label>
            <div className="row">
              <button
                className="button outline"
                disabled={i === 0}
                aria-label="Move image earlier"
                onClick={() => {
                  const next = [...images];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setImages(next);
                }}
              >
                ←
              </button>
              <button
                className="button outline"
                disabled={i === images.length - 1}
                aria-label="Move image later"
                onClick={() => {
                  const next = [...images];
                  [next[i], next[i + 1]] = [next[i + 1], next[i]];
                  setImages(next);
                }}
              >
                →
              </button>
              <ActionButton
                endpoint={`/api/admin/products/${p.id}/images/${img.id}`}
                method="DELETE"
                confirm="Delete this image?"
              >
                Delete
              </ActionButton>
            </div>
          </article>
        ))}
      </div>
      {images.length > 0 && (
        <button className="button outline" disabled={busy} onClick={save}>
          Save order & alt text
        </button>
      )}
      <form
        className="upload-box stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = new FormData();
          files.forEach((f) => form.append('files', f));
          try {
            await api(`/api/admin/products/${p.id}/images`, 'POST', form);
            setFiles([]);
            setMessage('Images uploaded.');
            router.refresh();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Upload images
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </label>
        <div className="upload-previews">
          {previews.map((url) => (
            <img src={url} alt="Upload preview" key={url} />
          ))}
        </div>
        <button className="button" disabled={busy || !files.length}>
          Upload {files.length || ''} images
        </button>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}

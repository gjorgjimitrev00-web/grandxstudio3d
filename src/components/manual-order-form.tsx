'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { api } from './api-form';
import { manualTotals, paymentLabels } from '@/lib/manual-order-rules';
import { money } from '@/lib/utils';

type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  salePrice: number | null;
  stock: number;
  trackInventory: boolean;
  inventoryMode: string;
  variants: {
    id: string;
    name: string;
    sku: string;
    price: number | null;
    priceAdjustment: number;
    stock: number;
    enabled: boolean;
  }[];
};
type Line = {
  key: string;
  productId: string;
  variantId: string;
  name: string;
  details: string;
  quantity: number;
  unitPrice: number;
};
const blank = (): Line => ({
  key: crypto.randomUUID(),
  productId: '',
  variantId: '',
  name: '',
  details: '',
  quantity: 1,
  unitPrice: 500,
});

export function ManualOrderForm({ products, today }: { products: Product[]; today: string }) {
  const [lines, setLines] = useState<Line[]>([
    {
      key: 'first',
      productId: '',
      variantId: '',
      name: '',
      details: '',
      quantity: 1,
      unitPrice: 500,
    },
  ]);
  const [status, setStatus] = useState('DELIVERED');
  const [paid, setPaid] = useState(true);
  const [fulfillment, setFulfillment] = useState('PICKUP');
  const [shipping, setShipping] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ key: string; fingerprint: string } | null>(null);
  const router = useRouter();
  const totals = manualTotals(lines, fulfillment === 'PICKUP' ? 0 : shipping);
  const update = (key: string, patch: Partial<Line>) =>
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <form
      className="manual-order-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        const payload = {
          date: fields.date,
          status,
          paid: status === 'DELIVERED' && paid,
          paymentMethod: fields.paymentMethod,
          fulfillment,
          shipping: totals.shipping,
          adjustStock: fields.adjustStock === 'on',
          firstName: fields.firstName,
          lastName: fields.lastName,
          email: fields.email,
          phone: fields.phone,
          city: fields.city,
          street: fields.street,
          postalCode: fields.postalCode,
          internalNotes: fields.internalNotes,
          items: lines.map(({ key, ...line }) => {
            void key;
            return line;
          }),
        };
        const fingerprint = JSON.stringify(payload);
        if (request.current && request.current.fingerprint !== fingerprint) {
          setError(
            'A previous submission may have been saved. Check Orders before changing and submitting again; reload this form for a new order.',
          );
          setBusy(false);
          return;
        }
        request.current ??= { key: crypto.randomUUID(), fingerprint };
        try {
          const result = await api('/api/admin/orders', 'POST', {
            ...payload,
            idempotencyKey: request.current.key,
          });
          router.push(`/admin/orders/${result.id}`);
          router.refresh();
        } catch (failure) {
          // Validation/auth failures cannot have created an order. Network/server
          // failures keep the key and payload locked so a retry cannot duplicate it.
          if (
            failure &&
            typeof failure === 'object' &&
            'status' in failure &&
            Number(failure.status) >= 400 &&
            Number(failure.status) < 500
          )
            request.current = null;
          setError(failure instanceof Error ? failure.message : 'Could not record the order.');
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="manual-order-fields">
        <div className="two-column">
          <div className="stack">
            <section className="panel">
              <div className="row between">
                <h2>Items</h2>
                <button
                  className="button outline"
                  type="button"
                  disabled={lines.length >= 100}
                  onClick={() => setLines((rows) => [...rows, blank()])}
                >
                  <Plus size={16} /> Add item
                </button>
              </div>
              <p className="form-note">
                Choose a shop product or enter a custom item. Set the actual agreed price per item,
                after any discount.
              </p>
              {lines.map((line, index) => {
                const product = products.find((p) => p.id === line.productId);
                const variant = product?.variants.find((v) => v.id === line.variantId);
                return (
                  <div className="manual-order-line" key={line.key}>
                    <div className="row between">
                      <b>Item {index + 1}</b>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Remove item ${index + 1}`}
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((rows) => rows.filter((row) => row.key !== line.key))
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <label>
                      Product
                      <select
                        aria-label={`Product ${index + 1}`}
                        value={line.productId}
                        onChange={(event) => {
                          const selected = products.find((p) => p.id === event.target.value);
                          update(line.key, {
                            productId: selected?.id || '',
                            variantId: '',
                            name: '',
                            unitPrice: selected ? (selected.salePrice ?? selected.price) : 500,
                          });
                        }}
                      >
                        <option value="">Custom item / not in the shop</option>
                        {products.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={!!p.variants.length && !p.variants.some((v) => v.enabled)}
                          >
                            {p.name} · {p.sku}
                            {p.variants.length && !p.variants.some((v) => v.enabled)
                              ? ' · no enabled variants'
                              : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!product && (
                      <label>
                        Item name
                        <input
                          aria-label={`Item name ${index + 1}`}
                          maxLength={200}
                          required
                          value={line.name}
                          onChange={(e) => update(line.key, { name: e.target.value })}
                          placeholder="e.g. Custom printed sign"
                        />
                      </label>
                    )}
                    {!!product?.variants.length && (
                      <label>
                        Variant
                        <select
                          required
                          aria-label={`Variant ${index + 1}`}
                          value={line.variantId}
                          onChange={(event) => {
                            const selected = product.variants.find(
                              (v) => v.id === event.target.value,
                            );
                            update(line.key, {
                              variantId: selected?.id || '',
                              unitPrice:
                                selected?.price ??
                                Math.max(
                                  0,
                                  (product.salePrice ?? product.price) +
                                    (selected?.priceAdjustment || 0),
                                ),
                            });
                          }}
                        >
                          <option value="">Choose a variant</option>
                          {product.variants
                            .filter((v) => v.enabled)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} · {v.sku}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <div className="form-grid">
                      <label>
                        Quantity
                        <input
                          aria-label={`Quantity ${index + 1}`}
                          type="number"
                          min={1}
                          max={999}
                          step={1}
                          required
                          value={line.quantity}
                          onChange={(e) =>
                            update(line.key, { quantity: e.target.valueAsNumber || 0 })
                          }
                        />
                      </label>
                      <label>
                        Unit price · MKD
                        <input
                          aria-label={`Unit price ${index + 1}`}
                          type="number"
                          min={0}
                          max={10000000}
                          step={1}
                          required
                          value={line.unitPrice}
                          onChange={(e) =>
                            update(line.key, { unitPrice: e.target.valueAsNumber || 0 })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Item details / personalization (optional)
                      <input
                        maxLength={500}
                        value={line.details}
                        onChange={(e) => update(line.key, { details: e.target.value })}
                        placeholder="Colour, size, text, or other agreed details"
                      />
                    </label>
                    <div className="row between">
                      <span className="small muted">
                        {product
                          ? product.trackInventory
                            ? `Tracked stock: ${variant?.stock ?? product.stock}`
                            : 'Made to order / stock not tracked'
                          : 'Custom item · no stock adjustment'}
                      </span>
                      <b>{money(line.quantity * line.unitPrice)}</b>
                    </div>
                  </div>
                );
              })}
              <label className="checkbox">
                <input type="checkbox" name="adjustStock" defaultChecked /> Deduct tracked stock for
                this order
              </label>
              <p className="form-note">
                For an older sale whose stock was already adjusted, untick this. Cancellation
                restores only stock deducted by this order.
              </p>
            </section>
            <section className="panel">
              <h2>Customer & handover</h2>
              <label>
                Handover
                <select
                  value={fulfillment}
                  onChange={(e) => {
                    setFulfillment(e.target.value);
                    setShipping(0);
                  }}
                >
                  <option value="PICKUP">In person / pickup</option>
                  <option value="DELIVERY">Delivery</option>
                </select>
              </label>
              <p className="form-note">
                Customer details are optional for an in-person sale. Leave them blank to record a
                walk-in customer.
              </p>
              <div className="form-grid">
                <label>
                  First name
                  <input name="firstName" maxLength={100} required={fulfillment === 'DELIVERY'} />
                </label>
                <label>
                  Last name
                  <input name="lastName" maxLength={100} />
                </label>
                <label>
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    maxLength={40}
                    required={fulfillment === 'DELIVERY'}
                  />
                </label>
                <label>
                  Email
                  <input name="email" type="email" maxLength={191} />
                </label>
                <label>
                  City
                  <input name="city" maxLength={100} required={fulfillment === 'DELIVERY'} />
                </label>
                <label>
                  Postal code
                  <input name="postalCode" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} />
                </label>
                <label className="span-2">
                  Street / address
                  <input name="street" maxLength={250} required={fulfillment === 'DELIVERY'} />
                </label>
              </div>
              {fulfillment === 'DELIVERY' && (
                <label>
                  Agreed delivery fee · MKD
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    required
                    value={shipping}
                    onChange={(e) => setShipping(e.target.valueAsNumber || 0)}
                  />
                </label>
              )}
            </section>
          </div>
          <div className="stack">
            <section className="panel">
              <h2>Sale details</h2>
              <label>
                Order date · Europe/Skopje
                <input
                  type="date"
                  name="date"
                  required
                  min="2000-01-01"
                  max={today}
                  defaultValue={today}
                />
              </label>
              <label>
                Order status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    if (e.target.value !== 'DELIVERED') setPaid(false);
                  }}
                >
                  <option value="DELIVERED">Completed / handed to customer</option>
                  <option value="NEW">New · to be confirmed</option>
                  <option value="CONFIRMED">Confirmed · production or preparation pending</option>
                </select>
              </label>
              <label>
                Payment method
                <select name="paymentMethod" defaultValue="CASH">
                  {Object.entries(paymentLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={paid}
                  disabled={status !== 'DELIVERED'}
                  onChange={(e) => setPaid(e.target.checked)}
                />{' '}
                Payment already received
              </label>
              <p className="form-note">
                This records a payment you received outside the website. For pending orders, confirm
                payment from the order page after handover.
              </p>
              <label>
                Internal notes
                <textarea
                  name="internalNotes"
                  maxLength={5000}
                  placeholder="Event, reference, customer agreement, or other notes"
                />
              </label>
            </section>
            <section className="panel manual-order-summary">
              <h2>Order summary</h2>
              <div className="totals">
                <div>
                  <span>Products</span>
                  <b>{money(totals.subtotal)}</b>
                </div>
                <div>
                  <span>Delivery</span>
                  <b>{money(totals.shipping)}</b>
                </div>
                <div>
                  <h3>Total</h3>
                  <h3>{money(totals.total)}</h3>
                </div>
              </div>
              <p className="form-note">
                {paid && status === 'DELIVERED'
                  ? 'This completed, paid sale counts toward revenue on the selected date.'
                  : 'This order will count toward paid revenue after delivery and payment are confirmed.'}
              </p>
              <p className="form-note">
                Manual orders use your agreed prices. Website campaigns and reward points are not
                applied.
              </p>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <button className="button full" type="submit">
                {busy ? 'Recording…' : 'Record order'}
              </button>
            </section>
          </div>
        </div>
      </fieldset>
    </form>
  );
}

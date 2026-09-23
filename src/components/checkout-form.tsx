'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LockKeyhole, PackageCheck } from 'lucide-react';
import { useCart, CartLines } from './cart-context';
import { money } from '@/lib/utils';
import { api } from './api-form';
type Shipping = {
  id: string;
  name: string;
  kind: string;
  price: number;
  freeThreshold: number | null;
};
type Profile = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  postalCode?: string;
};
type Quote = {
  subtotal: number;
  shipping: number;
  total: number;
  lines: { name: string; quantity: number; unitPrice: number; variantName?: string }[];
};
export function FullCart() {
  const { items, copy } = useCart();
  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link href="/shop">{copy.shop}</Link>
        <span>/</span>
        {copy.cart}
      </div>
      <h1 className="page-title">{copy.cart}</h1>
      <div className="two-column">
        <div>
          <CartLines />
          <Link href="/shop" className="text-link centered">
            {copy.continue} ↗
          </Link>
        </div>
        {items.length > 0 && (
          <aside className="summary">
            <h2>{copy.total}</h2>
            <div className="row between">
              <span>{copy.subtotal}</span>
              <b>{money(items.reduce((n, i) => n + i.quantity * i.price, 0))}</b>
            </div>
            <p className="form-note">
              Цените и доставата се потврдуваат на наплата. / Prices and delivery are confirmed at
              checkout.
            </p>
            <Link className="button full" href="/checkout">
              {copy.checkout}
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}
export function CheckoutForm({
  methods,
  profile = {},
}: {
  methods: Shipping[];
  profile?: Profile;
}) {
  const { items, clear, copy } = useCart();
  const [method, setMethod] = useState(methods[0]?.id || '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef('');
  const router = useRouter();
  const cart = items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId,
    quantity: i.quantity,
    options: i.options,
  }));
  const cartJson = JSON.stringify(cart);
  useEffect(() => {
    if (!cart.length || !method) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuote(null);
    setError('');
    api('/api/checkout/quote', 'POST', { items: JSON.parse(cartJson), shippingMethodId: method })
      .then((result) => {
        if (!cancelled) setQuote(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [cartJson, method]);
  useEffect(() => {
    const fingerprint = cartJson + method;
    const stored = sessionStorage.getItem('gx-checkout');
    try {
      const parsed = JSON.parse(stored || 'null');
      key.current = parsed?.fingerprint === fingerprint ? parsed.key : crypto.randomUUID();
    } catch {
      key.current = crypto.randomUUID();
    }
    sessionStorage.setItem('gx-checkout', JSON.stringify({ key: key.current, fingerprint }));
  }, [cartJson, method]);
  if (!items.length)
    return (
      <div className="empty">
        <p>{copy.empty}</p>
        <Link href="/shop" className="button">
          {copy.continue}
        </Link>
      </div>
    );
  return (
    <form
      className="two-column"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const data = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const result = await api('/api/checkout', 'POST', {
            ...data,
            country: 'MK',
            acceptTerms: data.acceptTerms === 'on',
            items: cart,
            shippingMethodId: method,
            idempotencyKey: key.current,
          });
          sessionStorage.removeItem('gx-checkout');
          clear();
          router.push(result.url);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : copy.error);
          setBusy(false);
        }
      }}
    >
      <div className="stack">
        <div className="panel">
          <h2>01 — {copy.shipping}</h2>
          <div className="form-grid">
            {(
              ['firstName', 'lastName', 'phone', 'email', 'city', 'postalCode', 'street'] as const
            ).map((name) => (
              <label key={name} className={name === 'street' ? 'span-2' : ''}>
                {name === 'firstName' ? copy.name : copy[name]}
                <input
                  name={name}
                  required
                  type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'}
                  autoComplete={
                    {
                      firstName: 'given-name',
                      lastName: 'family-name',
                      phone: 'tel',
                      email: 'email',
                      city: 'address-level2',
                      postalCode: 'postal-code',
                      street: 'street-address',
                    }[name]
                  }
                  defaultValue={profile[name] || ''}
                  maxLength={name === 'street' ? 250 : 191}
                  pattern={name === 'postalCode' ? '[0-9]{4}' : undefined}
                />
              </label>
            ))}
            <label className="span-2">
              Country
              <input value={copy.country} readOnly />
            </label>
            <label className="span-2">
              {copy.notes}
              <textarea name="notes" maxLength={2000} />
            </label>
          </div>
        </div>
        <div className="panel">
          <h2>02 — {copy.shipping}</h2>
          <div className="stack">
            {methods.map((m) => (
              <label className="shipping-choice" key={m.id}>
                <input
                  type="radio"
                  name="shippingChoice"
                  disabled={
                    m.kind === 'FREE' &&
                    m.freeThreshold !== null &&
                    (quote?.subtotal ?? items.reduce((n, i) => n + i.quantity * i.price, 0)) <
                      m.freeThreshold
                  }
                  checked={method === m.id}
                  onChange={() => setMethod(m.id)}
                />
                <span>
                  <b>{m.name}</b>
                  {m.freeThreshold !== null && (
                    <small>
                      {money(m.freeThreshold)} → {money(0)}
                    </small>
                  )}
                </span>
                <b>{money(m.price)}</b>
              </label>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>03 — {copy.cod}</h2>
          <p className="row">
            <PackageCheck size={25} />
            {copy.cod}
          </p>
          <p className="form-note">
            Плаќате кога ќе ја добиете пратката. / Pay when your package arrives.
          </p>
        </div>
      </div>
      <aside className="summary">
        <h2>{copy.cart}</h2>
        {quote?.lines.map((line, i) => (
          <div className="checkout-item" key={i}>
            <div>
              <b>{line.name}</b>
              <p className="small muted">
                {line.variantName} × {line.quantity}
              </p>
            </div>
            <b>{money(line.unitPrice * line.quantity)}</b>
          </div>
        ))}
        {quote ? (
          <>
            <div className="row between">
              <span>{copy.subtotal}</span>
              <b>{money(quote.subtotal)}</b>
            </div>
            <div className="row between">
              <span>{copy.shipping}</span>
              <b>{money(quote.shipping)}</b>
            </div>
            <div className="row between total">
              <span>{copy.total}</span>
              <b>{money(quote.total)}</b>
            </div>
          </>
        ) : (
          <p>{error ? '' : copy.loading}</p>
        )}
        <label className="checkbox terms-check">
          <input name="acceptTerms" type="checkbox" required />
          <span>
            {copy.privacyConsent}{' '}
            <Link href="/terms" target="_blank">
              Terms
            </Link>{' '}
            ·{' '}
            <Link href="/privacy" target="_blank">
              Privacy
            </Link>
          </span>
        </label>
        <p role="alert" className="error-text">
          {error}
        </p>
        <button className="button full" disabled={busy || !quote}>
          {busy ? copy.loading : copy.placeOrder}
        </button>
        <p className="checkout-secure">
          <LockKeyhole size={14} />
          {copy.cod}
        </p>
      </aside>
    </form>
  );
}

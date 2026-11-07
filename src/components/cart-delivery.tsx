'use client';
import { useEffect, useState } from 'react';
import { cartQuoteItems } from '@/lib/cart-lines';
import { Truck } from 'lucide-react';
import type { CartItem } from './cart-context';
import type { DeliveryProgressSettings } from '@/lib/cart-delivery';

export function CartDeliveryProgress({
  items,
  settings,
  locale,
}: {
  items: CartItem[];
  settings: DeliveryProgressSettings;
  locale: 'mk' | 'en';
}) {
  const en = locale === 'en';
  const body = JSON.stringify({
    items: cartQuoteItems(items),
    shippingMethodId: settings.quoteMethodId,
  });
  const [quote, setQuote] = useState<{ body: string; subtotal: number | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      try {
        const result = await fetch('/api/checkout/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (!result.ok) throw Error('quote');
        const { subtotal } = await result.json();
        if (!controller.signal.aborted)
          setQuote({ body, subtotal: Number.isSafeInteger(subtotal) ? subtotal : null });
      } catch {
        if (!controller.signal.aborted) setQuote({ body, subtotal: null });
      }
    }
    const timer = setTimeout(read, 120);
    const refresh = () => {
      if (document.visibilityState === 'visible') void read();
    };
    window.addEventListener('focus', refresh);
    const interval = setInterval(refresh, 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      controller.abort();
      window.removeEventListener('focus', refresh);
    };
  }, [body]);
  if (quote?.body !== body)
    return <p className="form-note">{en ? 'Checking delivery…' : 'Се проверува доставата…'}</p>;
  if (quote.subtotal === null)
    return (
      <p className="form-note">
        {en ? 'Delivery is confirmed at checkout.' : 'Доставата се потврдува при наплата.'}
      </p>
    );
  const left = Math.max(0, settings.threshold - quote.subtotal);
  const amount = new Intl.NumberFormat(en ? 'en-GB' : 'mk-MK').format(left);
  const label = left
    ? en
      ? `Add ${amount} MKD for free delivery.`
      : `Уште ${amount} денари до бесплатна достава.`
    : en
      ? 'You qualify for free delivery.'
      : 'Имаш бесплатна достава.';
  return (
    <div className="delivery-progress" aria-live="polite">
      <div>
        <Truck size={17} aria-hidden="true" />
        <span>{label}</span>
      </div>
      {settings.threshold > 0 && (
        <progress
          max={settings.threshold}
          value={Math.min(quote.subtotal, settings.threshold)}
          aria-label={label}
        />
      )}
    </div>
  );
}

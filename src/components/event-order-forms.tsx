'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowRight, Check, Copy } from 'lucide-react';

type Locale = 'mk' | 'en';
export function PrivateQuoteLink({ url, locale }: { url: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="event-link">
      <input
        ref={input}
        aria-label={locale === 'mk' ? 'Приватен линк' : 'Private link'}
        value={url}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        className="button outline"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            input.current?.focus();
            input.current?.select();
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
        {copied
          ? locale === 'mk'
            ? 'Копирано'
            : 'Copied'
          : locale === 'mk'
            ? 'Копирај линк'
            : 'Copy link'}
      </button>
    </div>
  );
}

export function EventRequestForm({
  locale,
  products,
  today,
}: {
  locale: Locale;
  products: { id: string; name: string }[];
  today: string;
}) {
  const en = locale === 'en';
  const router = useRouter();
  const key = useRef('');
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="panel event-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError('');
        const form = new FormData(e.currentTarget);
        key.current ||= crypto.randomUUID();
        form.set('requestKey', key.current);
        try {
          const res = await fetch('/api/event-orders', { method: 'POST', body: form });
          const data = await res.json();
          if (!res.ok) throw Error(data.error);
          router.push(data.url);
        } catch (e) {
          setError(e instanceof Error ? e.message : en ? 'Try again.' : 'Обиди се повторно.');
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>{en ? 'Tell us about your event' : 'Кажи ни за настанот'}</legend>
        <div className="form-grid">
          <label className="span-2">
            {en ? 'Product to personalise' : 'Производ за персонализација'}
            <select name="productId" defaultValue="">
              <option value="">{en ? 'My own idea' : 'Своја идеја'}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {en ? 'Quantity' : 'Количина'}
            <input type="number" name="quantity" defaultValue={20} min={2} max={1000} required />
          </label>
          <label>
            {en ? 'Event date' : 'Датум на настанот'}
            <input type="date" name="eventDate" min={today} required />
          </label>
          <label className="span-2">
            {en ? 'What should we make?' : 'Што да изработиме?'}
            <textarea
              name="notes"
              required
              maxLength={3000}
              placeholder={
                en
                  ? 'Occasion, colours, inscription or packaging…'
                  : 'Повод, бои, натпис или пакување…'
              }
              rows={3}
            />
          </label>
          <label>
            {en ? 'Your name' : 'Име и презиме'}
            <input name="name" autoComplete="name" required maxLength={150} />
          </label>
          <label>
            {en ? 'Company (optional)' : 'Компанија (по избор)'}
            <input name="company" autoComplete="organization" maxLength={150} />
          </label>
          <label>
            {en ? 'Email' : 'Е-пошта'}
            <input type="email" name="email" autoComplete="email" maxLength={191} required />
          </label>
          <label>
            {en ? 'Phone' : 'Телефон'}
            <input type="tel" name="phone" autoComplete="tel" maxLength={40} required />
          </label>
          <label className="span-2">
            {en ? 'Logo (optional)' : 'Лого (по избор)'}
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
            <small>JPG, PNG, WebP · 5 MB</small>
          </label>
          <label className="span-2">
            {en ? 'Names for printing (optional)' : 'Имиња за печатење (по избор)'}
            <textarea
              name="names"
              rows={3}
              maxLength={32000}
              placeholder={en ? 'One name per line' : 'По едно име во ред'}
            />
          </label>
          <label className="span-2">
            {en ? 'Or upload your names list' : 'Или прикачи список со имиња'}
            <input name="namesFile" type="file" accept=".txt,.csv" />
            <small>TXT, CSV · UTF-8 · 64 KB</small>
          </label>
          <input
            className="honeypot"
            name="website"
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
          />
          <label className="checkbox span-2">
            <input type="checkbox" name="consent" value="yes" required />
            <span>
              {en
                ? 'I allow the studio to use my contact details and files to prepare this quote.'
                : 'Му дозволувам на студиото да ги користи контактот и датотеките за оваа понуда.'}{' '}
              <Link href="/privacy">{en ? 'Privacy' : 'Приватност'}</Link>
            </span>
          </label>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="button" type="submit">
          {busy
            ? en
              ? 'Sending…'
              : 'Се испраќа…'
            : en
              ? 'Request a sample and quote'
              : 'Побарај примерок и понуда'}
          <ArrowRight size={16} />
        </button>
      </fieldset>
    </form>
  );
}

export function QuoteApproval({
  id,
  token,
  revision,
  locale,
}: {
  id: string;
  token: string;
  revision: number;
  locale: Locale;
}) {
  const en = locale === 'en';
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return (
    <form
      className="panel event-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        const values = Object.fromEntries(new FormData(e.currentTarget));
        lock.current = true;
        setBusy(true);
        setError('');
        try {
          const res = await fetch('/api/event-orders/' + id + '/' + token + '/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...values, consent: values.consent === 'yes', revision }),
          });
          const data = await res.json();
          if (!res.ok) throw Error(data.error);
          router.push('/order-confirmation/' + data.number);
        } catch (e) {
          setError(e instanceof Error ? e.message : en ? 'Try again.' : 'Обиди се повторно.');
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>{en ? 'Delivery in North Macedonia' : 'Достава во Северна Македонија'}</legend>
        <div className="form-grid">
          <label className="span-2">
            {en ? 'Street and number' : 'Улица и број'}
            <input name="street" autoComplete="street-address" required maxLength={180} />
          </label>
          <label>
            {en ? 'City' : 'Град'}
            <input name="city" autoComplete="address-level2" required maxLength={100} />
          </label>
          <label>
            {en ? 'Postal code' : 'Поштенски број'}
            <input
              name="postalCode"
              autoComplete="postal-code"
              required
              pattern="[0-9]{4}"
              inputMode="numeric"
              maxLength={4}
            />
          </label>
          <label className="checkbox span-2">
            <input type="checkbox" name="consent" value="yes" required />
            <span>
              {en
                ? 'I approve this sample, quantity, price and production deadline. I will pay on delivery.'
                : 'Ги одобрувам примерокот, количината, цената и рокот за изработка. Ќе платам при достава.'}
            </span>
          </label>
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button className="button" type="submit">
          {busy
            ? en
              ? 'Confirming…'
              : 'Се потврдува…'
            : en
              ? 'Approve and place order'
              : 'Одобри и нарачај'}
          <Check size={17} />
        </button>
      </fieldset>
    </form>
  );
}

export function AdminQuoteForm({
  id,
  revision,
  readyBy,
  eventDate,
  unitPrice,
  notes,
  today,
}: {
  id: string;
  revision: number;
  readyBy: string | null;
  eventDate: string;
  unitPrice: number | null;
  notes: string | null;
  today: string;
}) {
  const router = useRouter();
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  return (
    <form
      className="panel event-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        const form = new FormData(e.currentTarget);
        form.set('revision', String(revision));
        lock.current = true;
        setBusy(true);
        setSuccess('');
        setError('');
        try {
          const res = await fetch('/api/admin/event-orders/' + id + '/quote', {
            method: 'POST',
            body: form,
          });
          const data = await res.json();
          if (!res.ok) throw Error(data.error);
          setSuccess('Quote available on the private customer link.');
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Try again.');
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>{revision ? 'Revise quote' : 'Prepare quote'}</legend>
        <div className="form-grid">
          <label>
            Price per piece · MKD
            <input
              name="unitPrice"
              type="number"
              min={1}
              max={1000000}
              defaultValue={unitPrice ?? ''}
              required
            />
          </label>
          <label>
            Production deadline
            <input
              name="readyBy"
              type="date"
              min={today}
              max={eventDate}
              defaultValue={readyBy || ''}
              required
            />
          </label>
          <label className="span-2">
            Sample image {revision ? '(optional replacement)' : ''}
            <input
              name="sample"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={!revision}
            />
            <small>JPG, PNG, WebP · 5 MB</small>
          </label>
          <label className="span-2">
            Quote notes
            <textarea name="quoteNotes" defaultValue={notes || ''} maxLength={3000} rows={3} />
          </label>
        </div>
        <p className="form-note">
          Delivery is calculated from the quoted merchandise subtotal. The customer sees the sample
          and full cash-on-delivery total before approval.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {success && <p role="status">{success}</p>}
        <button type="submit" className="button">
          {busy ? 'Saving…' : 'Publish to private link'}
        </button>
      </fieldset>
    </form>
  );
}

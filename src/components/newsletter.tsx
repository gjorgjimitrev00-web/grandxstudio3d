'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Copy } from '@/lib/i18n';
export function Newsletter({ copy }: { copy: Copy }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="newsletter">
      <div>
        <p className="eyebrow">THE STUDIO LETTER</p>
        <h2>{copy.newsletter}</h2>
        <p>{copy.newsletterSub}</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = e.currentTarget;
          try {
            const res = await fetch('/api/newsletter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.fromEntries(new FormData(form))),
            });
            const data = await res.json();
            if (!res.ok) throw Error(data.error);
            setMessage(copy.success);
            form.reset();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : copy.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="newsletter-input">
          <input
            name="email"
            type="email"
            required
            placeholder={copy.email}
            aria-label={copy.email}
          />
          <button disabled={busy} aria-label={copy.subscribe}>
            <ArrowRight />
          </button>
        </div>
        <input
          name="website"
          className="honeypot"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        <p className="small">
          {copy.subscribe} · <a href="/privacy">Privacy</a>
        </p>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}

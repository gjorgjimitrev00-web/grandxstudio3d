'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export async function api(url: string, method: string, data?: unknown) {
  const multipart = data instanceof FormData;
  const response = await fetch(url, {
    method,
    headers: multipart ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : multipart ? data : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Request failed.');
  return result;
}
export function ApiForm({
  endpoint,
  method = 'POST',
  children,
  submit = 'Save',
  multipart = false,
  success = 'Saved.',
  redirect,
  refresh = false,
  transform,
}: {
  endpoint: string;
  method?: string;
  children: React.ReactNode;
  submit?: string;
  multipart?: boolean;
  success?: string;
  redirect?: string;
  refresh?: boolean;
  transform?: (data: Record<string, FormDataEntryValue>) => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const router = useRouter();
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        const form = e.currentTarget;
        const formData = new FormData(form);
        try {
          await api(
            endpoint,
            method,
            multipart
              ? formData
              : transform
                ? transform(Object.fromEntries(formData))
                : Object.fromEntries(formData),
          );
          setError(false);
          setMessage(success);
          if (redirect) router.push(redirect);
          if (refresh) router.refresh();
          if (!refresh && !redirect) form.reset();
        } catch (e) {
          setError(true);
          setMessage(e instanceof Error ? e.message : 'Please try again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <p role="status" className={error ? 'error-text' : 'success-text'}>
        {message}
      </p>
      <button className="button" disabled={busy}>
        {busy ? '…' : submit}
      </button>
    </form>
  );
}
export function ActionButton({
  endpoint,
  method = 'POST',
  data,
  children,
  confirm,
  redirect,
}: {
  endpoint: string;
  method?: string;
  data?: unknown;
  children: React.ReactNode;
  confirm?: string;
  redirect?: string;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <span>
      <button
        disabled={busy}
        className="button outline"
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          try {
            const result = await api(endpoint, method, data);
            if (redirect)
              router.push(redirect === 'result' ? `/admin/products/${result.id}` : redirect);
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Error');
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {message && (
        <span role="alert" className="error-text">
          {message}
        </span>
      )}
    </span>
  );
}

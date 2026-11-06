'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api-form';
import type { FrameSize } from '@/lib/frame-artwork';
import { FRAME_PAPERS, type FramePrices } from '@/lib/frame-price-rules';

export function FramePriceForm({
  sizes,
  prices,
  revision: savedRevision,
}: {
  sizes: { id: FrameSize; dimensions: string }[];
  prices: FramePrices;
  revision: string;
}) {
  const [revision, setRevision] = useState(savedRevision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const next: FramePrices = {};
        for (const { id } of sizes) {
          for (const paper of FRAME_PAPERS) {
            const field = fields.get(`${id}-${paper}`);
            if (typeof field === 'string' && field !== '') {
              (next[id] ??= {})[paper] = Number(field);
            }
          }
        }
        setBusy(true);
        setMessage('');
        try {
          const result = await api('/api/admin/frame-pricing', 'PUT', { prices: next, revision });
          setRevision(result.revision);
          setMessage('Prices saved. New customers will see these prices.');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not save prices.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Print size</th>
              <th>Glossy · MKD</th>
              <th>Matte · MKD</th>
            </tr>
          </thead>
          <tbody>
            {sizes.map(({ id, dimensions }) => (
              <tr key={id}>
                <th scope="row">
                  {id}
                  <br />
                  <small>{dimensions}</small>
                </th>
                {FRAME_PAPERS.map((paper) => (
                  <td key={paper}>
                    <input
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      name={`${id}-${paper}`}
                      aria-label={`${id} ${paper} price in MKD`}
                      defaultValue={prices[id]?.[paper] ?? ''}
                      placeholder="On request"
                      disabled={busy}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status">{message}</p>
      <div>
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : 'Save prices'}
        </button>
      </div>
    </form>
  );
}

export function FrameStatusForm({
  id,
  status,
  options,
}: {
  id: string;
  status: string;
  options: string[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const next = new FormData(event.currentTarget).get('status');
        setBusy(true);
        setMessage('');
        try {
          await api(`/api/admin/frame-orders/${id}`, 'PATCH', {
            status: next,
            expectedStatus: status,
          });
          setMessage('Status saved.');
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not save status.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Status
        <select name="status" defaultValue={status}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <button className="button outline" disabled={busy}>
        Save status
      </button>
      <p role="status">{message}</p>
    </form>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ActionButton } from './api-form';
import type { BlackFriday } from '@/lib/campaign-rules';

export function CampaignForm({
  campaign,
  products,
  categories,
}: {
  campaign: BlackFriday;
  products: { id: string; name: string; published: boolean }[];
  categories: { id: string; name: string; enabled: boolean }[];
}) {
  const [selectedProducts, setProducts] = useState(campaign.productIds);
  const [selectedCategories, setCategories] = useState(campaign.categoryIds);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  function toggle(ids: string[], id: string, checked: boolean) {
    return checked ? [...ids, id] : ids.filter((v) => v !== id);
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        const values = new FormData(e.currentTarget);
        try {
          await api('/api/admin/campaigns/black-friday', 'PUT', {
            enabled: values.get('enabled') === 'on',
            startsOn: values.get('startsOn'),
            endsOn: values.get('endsOn'),
            discountPercent: Number(values.get('discountPercent')),
            productIds: selectedProducts,
            categoryIds: selectedCategories,
          });
          setMessage('Зачувано. Распоредот и прекинувачот се ажурирани.');
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Неуспешно зачувување.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="checkbox">
        <input type="checkbox" name="enabled" defaultChecked={campaign.enabled} />
        Овозможи Black Friday според распоредот
      </label>
      <div className="form-grid">
        <label>
          Почетен датум
          <input name="startsOn" type="date" defaultValue={campaign.startsOn} />
        </label>
        <label>
          Краен датум
          <input name="endsOn" type="date" defaultValue={campaign.endsOn} />
        </label>
        <label>
          Попуст (%)
          <input
            name="discountPercent"
            type="number"
            min="1"
            max="90"
            step="1"
            required
            defaultValue={campaign.discountPercent}
          />
        </label>
      </div>
      <p className="form-note">
        Временска зона: Europe/Skopje. Почнува во 00:00 на почетниот датум и важи до крајот на
        последниот ден. Потребни се двата датума и барем еден избран производ или категорија.
      </p>
      <fieldset>
        <legend>Категории</legend>
        <p className="form-note">Важи за сите сегашни и идни производи во избраните категории.</p>
        <div className="campaign-choices">
          {categories.map((c) => (
            <label className="checkbox" key={c.id}>
              <input
                type="checkbox"
                checked={selectedCategories.includes(c.id)}
                onChange={(e) => setCategories(toggle(selectedCategories, c.id, e.target.checked))}
              />
              {c.name}
              {!c.enabled && ' — скриена'}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Поединечни производи · {selectedProducts.length} избрани</legend>
        <label>
          Пребарај производ
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="campaign-choices">
          {products
            .filter((p) => p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
            .map((p) => (
              <label className="checkbox" key={p.id}>
                <input
                  type="checkbox"
                  checked={selectedProducts.includes(p.id)}
                  onChange={(e) => setProducts(toggle(selectedProducts, p.id, e.target.checked))}
                />
                {p.name}
                {!p.published && ' — необјавен'}
              </label>
            ))}
        </div>
      </fieldset>
      <p className="form-note">
        Изборите се собираат: важи ако е избран производот или неговата категорија. Скриените
        производи остануваат скриени. Попустот се пресметува од редовната цена; постоечка пониска
        акциска цена се задржува. Нарачките со Black Friday производи не користат поени или
        подароци. Купувачите продолжуваат да заработуваат поени од платената сума.
      </p>
      <p role="status">{message}</p>
      <div className="row campaign-actions">
        <button className="button" disabled={busy}>
          {busy ? 'Се зачувува…' : 'Зачувај Black Friday'}
        </button>
      </div>
    </form>
  );
}

export function StopCampaign() {
  return (
    <ActionButton
      endpoint="/api/admin/campaigns/black-friday"
      method="PATCH"
      data={{ enabled: false }}
    >
      Исклучи Black Friday веднаш
    </ActionButton>
  );
}

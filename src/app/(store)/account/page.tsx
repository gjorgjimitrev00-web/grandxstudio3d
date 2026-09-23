import Link from 'next/link';
import { currentUser } from '@/lib/security';
import { db } from '@/lib/db';
import { getCopy } from '@/lib/i18n';
import { LoginForm } from '@/components/account';
import { ApiForm, ActionButton } from '@/components/api-form';
import { money } from '@/lib/utils';
export const metadata = { title: 'My account', robots: { index: false, follow: false } };
export default async function Account() {
  const user = await currentUser();
  const copy = await getCopy();
  if (!user)
    return (
      <div className="page">
        <div className="narrow">
          <p className="eyebrow orange">WELCOME TO THE STUDIO</p>
          <h1 className="page-title">{copy.account}</h1>
          <LoginForm copy={copy} />
        </div>
      </div>
    );
  const customer = await db.customer.findUnique({
    where: { userId: user.id },
    include: { addresses: { take: 1 }, orders: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  const address = customer?.addresses[0];
  return (
    <div className="page">
      <div className="section-heading">
        <h1 className="page-title">{user.name}</h1>
        <ActionButton endpoint="/api/auth/logout" redirect="/account">
          {copy.logout}
        </ActionButton>
      </div>
      {user.role === 'ADMIN' && (
        <Link className="button" href="/admin">
          Open studio dashboard ↗
        </Link>
      )}
      <div className="two-column">
        <section className="panel">
          <h2>{copy.orders}</h2>
          {customer?.orders.length ? (
            customer.orders.map((o) => (
              <Link className="order-list-row" href={`/order-confirmation/${o.number}`} key={o.id}>
                <div>
                  <b>{o.number}</b>
                  <p className="small muted">
                    {o.createdAt.toLocaleDateString('mk-MK')} · {o.status}
                  </p>
                </div>
                <b>{money(o.total)}</b>
              </Link>
            ))
          ) : (
            <p className="muted">
              Нема нарачки поврзани со овој профил. / No orders linked to this account.
            </p>
          )}
        </section>
        <div className="stack">
          <div className="panel">
            <h2>{copy.address}</h2>
            <ApiForm endpoint="/api/account/profile" method="PUT" submit={copy.save} refresh>
              <div className="form-grid">
                {(['firstName', 'lastName', 'phone', 'city', 'postalCode', 'street'] as const).map(
                  (name) => (
                    <label key={name} className={name === 'street' ? 'span-2' : ''}>
                      {name === 'firstName' ? copy.name : copy[name]}
                      <input
                        name={name}
                        required
                        defaultValue={
                          name === 'firstName' || name === 'lastName' || name === 'phone'
                            ? customer?.[name] || ''
                            : address?.[name] || ''
                        }
                      />
                    </label>
                  ),
                )}
              </div>
            </ApiForm>
          </div>
          <div className="panel">
            <h2>{copy.password}</h2>
            <ApiForm endpoint="/api/account/password" submit={copy.save}>
              <label>
                Current password
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                />
              </label>
            </ApiForm>
          </div>
        </div>
      </div>
    </div>
  );
}

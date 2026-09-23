import { getCopy } from '@/lib/i18n';
import { getSettings } from '@/lib/settings';
import { ApiForm } from '@/components/api-form';
export const metadata = { title: 'Contact', alternates: { canonical: '/contact' } };
export default async function Contact() {
  const [copy, s] = await Promise.all([getCopy(), getSettings()]);
  return (
    <div className="page">
      <div className="two-column">
        <div>
          <p className="eyebrow orange">LET’S MAKE SOMETHING</p>
          <h1 className="page-title">{copy.contact}</h1>
          <p className="page-intro">
            Имате прашање за производ, нарачка или нова идеја? Пишете ни.
          </p>
          {s.email && (
            <p>
              <a className="text-link" href={`mailto:${s.email}`}>
                {s.email}
              </a>
            </p>
          )}
          {s.phone && <p>{s.phone}</p>}
          {s.address && <p>{s.address}</p>}
        </div>
        <div className="panel">
          <ApiForm endpoint="/api/contact" submit={copy.send} success={copy.success}>
            <div className="form-grid">
              {(['name', 'email', 'phone', 'subject'] as const).map((name) => (
                <label key={name}>
                  {copy[name]}
                  <input
                    name={name}
                    type={name === 'email' ? 'email' : 'text'}
                    required={name !== 'phone'}
                    maxLength={200}
                  />
                </label>
              ))}
              <label className="span-2">
                {copy.message}
                <textarea name="message" required maxLength={10000} />
              </label>
            </div>
            <input name="website" className="honeypot" tabIndex={-1} />
            <label className="checkbox">
              <input type="checkbox" required />
              <span>
                {copy.privacyConsent} <a href="/privacy">Privacy</a>
              </span>
            </label>
          </ApiForm>
        </div>
      </div>
    </div>
  );
}

import { getCopy } from '@/lib/i18n';
import { ApiForm } from '@/components/api-form';
export const metadata = { title: 'Custom 3D print', alternates: { canonical: '/custom-order' } };
export default async function CustomOrder() {
  const copy = await getCopy();
  return (
    <div className="page">
      <div className="custom-page">
        <div>
          <p className="eyebrow orange">MADE FOR YOU. FROM THE FIRST LAYER.</p>
          <h1 className="page-title">{copy.customTitle}</h1>
          <p className="page-intro">{copy.customText}</p>
          <img className="custom-page-image" src="/images/hero.webp" alt="3D печатени предмети" />
          <div className="process-steps">
            <p>
              <b>01</b> Сподели ја идејата
            </p>
            <p>
              <b>02</b> Ги договараме деталите и цената
            </p>
            <p>
              <b>03</b> Печатиме по твое одобрување
            </p>
          </div>
        </div>
        <div className="panel">
          <ApiForm
            endpoint="/api/custom-orders"
            multipart
            submit={copy.send}
            success={copy.success}
          >
            <div className="form-grid">
              {(['name', 'phone', 'email', 'dimensions', 'color', 'material'] as const).map(
                (name) => (
                  <label key={name}>
                    {copy[name]}
                    <input
                      name={name}
                      type={name === 'email' ? 'email' : 'text'}
                      required={['name', 'phone', 'email'].includes(name)}
                      maxLength={150}
                    />
                  </label>
                ),
              )}
              <label>
                {copy.quantity}
                <input name="quantity" type="number" min="1" max="1000" defaultValue="1" required />
              </label>
              <label className="span-2">
                {copy.description}
                <textarea name="description" required maxLength={10000} />
              </label>
              <label className="span-2">
                {copy.notes}
                <textarea name="notes" maxLength={3000} />
              </label>
              <label className="span-2 upload-box">
                {copy.file}
                <input
                  type="file"
                  name="file"
                  accept=".stl,.3mf,.step,.stp,.obj,.zip,.pdf,.png,.jpg,.jpeg"
                />
                <span className="form-note">
                  STL, 3MF, STEP, OBJ, ZIP, PDF, JPG, PNG · max. 20 MB
                  <br />
                  Датотеките се приватни и достапни само за студиото.
                </span>
              </label>
            </div>
            <input className="honeypot" name="website" tabIndex={-1} />
            <label className="checkbox">
              <input type="checkbox" required />
              <span>
                {copy.privacyConsent}{' '}
                <a href="/privacy" target="_blank">
                  Privacy
                </a>
              </span>
            </label>
          </ApiForm>
        </div>
      </div>
    </div>
  );
}

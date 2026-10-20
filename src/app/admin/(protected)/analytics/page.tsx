import { headers } from 'next/headers';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-access';
import { getSettings } from '@/lib/settings';
import { shiftDay, studioDay, validDay } from '@/lib/time';
import { visitorReport } from '@/lib/visitors';
import { visitorIp } from '@/lib/ip-address';
import { cityDatabaseRelease } from '@/lib/visitor-geo';
import { VISITOR_RETENTION_DAYS } from '@/lib/visitor-rules';
import { AdminHeading } from '@/components/admin-shared';
import { VisitorSettings } from '@/components/visitor-settings';

export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const today = studioDay();
  const firstDay = shiftDay(today, -(VISITOR_RETENTION_DAYS - 1));
  const requestedDay = params.date || today;
  const day =
    validDay(requestedDay) && requestedDay >= firstDay && requestedDay <= today
      ? requestedDay
      : today;
  const [report, settings, requestHeaders] = await Promise.all([
    visitorReport(day),
    getSettings(),
    headers(),
  ]);
  const ipReady = !!visitorIp(requestHeaders);
  const max = Math.max(1, ...report.daily.map((row) => row.visitors));
  return (
    <>
      <AdminHeading
        title="Visitors"
        sub="Daily visitor estimates and approximate cities in North Macedonia."
      >
        <a className="button outline" href={`/admin/analytics?date=${day}`}>
          Refresh report
        </a>
      </AdminHeading>
      <form className="admin-search analytics-filters">
        <label>
          Report date · Europe/Skopje
          <input name="date" type="date" min={firstDay} max={today} defaultValue={day} required />
        </label>
        <button className="button">Show report</button>
        <Link className="text-link" href="/admin/analytics">
          Today
        </Link>
      </form>
      {!ipReady && (
        <div className="notice">
          A public client IP is not available in the configured hosting header. These requests are
          excluded. On Hostinger, verify the client-IP header and set ANALYTICS_IP_HEADER to
          x-forwarded-for, x-real-ip, or cf-connecting-ip as appropriate.
        </div>
      )}
      {settings.analyticsEnabled === 'false' && (
        <div className="notice">Visitor tracking is paused.</div>
      )}
      <div className="stats-grid visitor-stats">
        <div className="stat">
          <span>{day === today ? 'Visitors today · estimated' : 'Visitors · estimated'}</span>
          <strong>{report.total}</strong>
        </div>
        <div className="stat">
          <span>Located in North Macedonia</span>
          <strong>{report.macedonia}</strong>
        </div>
        <div className="stat">
          <span>Other / unknown location</span>
          <strong>{report.unknown}</strong>
        </div>
      </div>
      <p className="form-note">
        One network-and-browser combination counts once per local day. Repeat visits do not increase
        the daily count. Shared networks can merge visitors; a changed network or browser can count
        again. Signed-in admins, common bots and opted-out browsers are excluded.
      </p>
      <div className="two-column admin-section">
        <section className="panel">
          <h2>Cities in North Macedonia</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Approximate city</th>
                  <th>Visitors</th>
                  <th>Share of MK visitors</th>
                </tr>
              </thead>
              <tbody>
                {report.cities.map((row) => (
                  <tr key={row.city}>
                    <td>{row.city || 'Unknown city'}</td>
                    <td>{row._count}</td>
                    <td>
                      {report.macedonia ? Math.round((row._count / report.macedonia) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.cities.length && (
            <p className="empty">No visits located in North Macedonia for this day yet.</p>
          )}
          <p className="form-note">
            IP location is approximate; mobile networks and VPNs may show another city. A missing
            match is included in Other / unknown.
          </p>
          <p className="form-note">
            <a
              className="text-link"
              href="https://db-ip.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              IP Geolocation by DB-IP
            </a>{' '}
            · Local database: {cityDatabaseRelease}
          </p>
        </section>
        <section className="panel">
          <h2>Daily visitors · last 7 days</h2>
          <div className="visitor-trend" aria-label="Daily estimated visitors">
            {report.daily.map((row) => (
              <div className="visitor-trend-row" key={row.day}>
                <span>{row.day.slice(5)}</span>
                <div className="visitor-trend-track">
                  <span style={{ width: `${(row.visitors / max) * 100}%` }} />
                </div>
                <b>{row.visitors}</b>
              </div>
            ))}
          </div>
          <p className="form-note">
            Each day has its own count. A returning visitor can appear on multiple days.
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Measurement settings</h2>
        <VisitorSettings enabled={settings.analyticsEnabled !== 'false'} />
        <p className="form-note">
          Counts begin when this version is deployed; earlier traffic cannot be reconstructed. The
          report stores no raw IP addresses, precise locations or customer details. Records are
          automatically pruned during new visits and by the maintenance command. Browser privacy
          controls are available on the{' '}
          <Link className="text-link" href="/privacy#visitor-statistics">
            privacy page
          </Link>
          .
        </p>
      </section>
    </>
  );
}

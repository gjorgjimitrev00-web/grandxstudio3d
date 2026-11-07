import Link from 'next/link';
import { AdminHeading } from '@/components/admin-shared';
import { ProductionPlan } from '@/components/production-plan';
import { productionJobs, stations } from '@/lib/production';
import { requireAdminPage } from '@/lib/admin-access';
import { studioDay } from '@/lib/time';
import './production.css';
export default async function Production({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const [jobs, q] = await Promise.all([productionJobs(), searchParams]);
  const today = studioDay();
  const timing = String(q.when || 'all'),
    station = String(q.station || ''),
    term = String(q.material || '')
      .slice(0, 100)
      .toLowerCase();
  const groups = ['Overdue', 'Due today', 'Upcoming', 'Unscheduled'];
  const group = (due: string | null) =>
    !due ? 'Unscheduled' : due < today ? 'Overdue' : due === today ? 'Due today' : 'Upcoming';
  const rows = jobs.filter(
    (j) =>
      (!station || j.station === station) &&
      (!term || j.material.toLowerCase().includes(term)) &&
      (timing === 'all' ||
        (timing === 'today' ? j.due !== null && j.due <= today : timing === group(j.due))),
  );
  return (
    <>
      <AdminHeading
        title="Што печатам денес?"
        sub="Production queue · Shop, walk-ins, approved event orders, custom prints and frames."
      />
      <form className="queue-filters">
        <label>
          Due
          <select name="when" defaultValue={timing}>
            <option value="all">All open work</option>
            <option value="today">Today and overdue</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Unscheduled">Unscheduled</option>
          </select>
        </label>
        <label>
          Station
          <select name="station" defaultValue={station}>
            <option value="">All stations</option>
            {Object.entries(stations).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Material or paper
          <input name="material" defaultValue={String(q.material || '')} maxLength={100} />
        </label>
        <button className="button outline">Filter jobs</button>
      </form>
      {!rows.length && (
        <p className="panel">
          No open jobs match this view.{' '}
          <Link href="/admin/production" className="text-link">
            Show all jobs
          </Link>
        </p>
      )}
      {groups.map((g) => {
        const batch = rows.filter((j) => group(j.due) === g);
        return (
          batch.length > 0 && (
            <section className="queue-group" key={g}>
              <h2>
                {g} <small>{batch.length}</small>
              </h2>
              {batch.map((j) => (
                <article className="panel queue-job" key={j.kind + j.id}>
                  <div className="queue-job-main">
                    <div>
                      <p className="small muted">
                        {j.source} · {j.customer || 'Walk-in'}
                      </p>
                      <Link href={j.link}>
                        <h3>{j.title}</h3>
                      </Link>
                    </div>
                    <b>{j.next}</b>
                  </div>
                  <dl>
                    <div>
                      <dt>Station</dt>
                      <dd>{stations[j.station]}</dd>
                    </div>
                    <div>
                      <dt>Quantity</dt>
                      <dd>{j.quantity}</dd>
                    </div>
                    <div>
                      <dt>Material / paper</dt>
                      <dd>{j.material}</dd>
                    </div>
                    <div>
                      <dt>Due</dt>
                      <dd>{j.due || 'Unscheduled'}</dd>
                    </div>
                  </dl>
                  <div className="row">
                    <Link href={j.link} className="text-link">
                      Open job ↗
                    </Link>
                    {j.eventLink && (
                      <Link href={j.eventLink} className="text-link">
                        Approved sample ↗
                      </Link>
                    )}
                  </div>
                  <ProductionPlan
                    key={JSON.stringify(j.plan)}
                    kind={j.kind}
                    id={j.id}
                    expected={j.plan}
                    material={j.defaultMaterial}
                    stationOptions={Object.entries(stations)}
                  />
                </article>
              ))}
            </section>
          )
        );
      })}
    </>
  );
}

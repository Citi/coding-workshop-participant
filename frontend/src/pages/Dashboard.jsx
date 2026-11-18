import { useCallback, useEffect, useState } from 'react';
import { Section, StatCard, StatusBadge } from '../components/Badges';
import IncidentTable from '../components/IncidentTable';
import useAction from '../hooks/useAction';
import { setMyAvailability } from '../services/adminService';
import { getDashboard } from '../services/incidentService';
import { AVAILABILITY_LABELS, STATUS_LABELS, categoryLabel, sumCounts } from '../utils/format';

function EmployeeView({ data }) {
  const c = data.status_counts;
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Waiting for engineer" value={sumCounts(c, ['open', 'assigned'])} tone="info" />
        <StatCard label="Being worked on" value={sumCounts(c, ['in_progress', 'on_hold'])} tone="warn" />
        <StatCard label="Resolved" value={sumCounts(c, ['resolved', 'closed'])} tone="ok" />
        <StatCard label="Total reported" value={sumCounts(c, Object.keys(STATUS_LABELS))} />
      </div>
      <Section title="My incidents">
        <IncidentTable
          incidents={data.incidents}
          columns={['engineer']}
          empty="You haven't reported any incidents yet."
        />
      </Section>
    </>
  );
}

const AVAILABILITY_HINTS = {
  available: 'You can receive new assignments.',
  busy: 'Admins can still assign you, but will see you are busy.',
  on_leave: 'Admins can’t assign you new tickets while you are on leave.',
  offline: 'Admins can’t assign you new tickets while you are offline.',
};

function AvailabilitySwitch({ value, onChanged }) {
  const { run, busy, error } = useAction();
  return (
    <section className="panel availability-panel" aria-labelledby="avail-label">
      <div className="availability-row">
        <div>
          <h2 id="avail-label">My availability</h2>
          <p className="muted small">{AVAILABILITY_HINTS[value]}</p>
        </div>
        <div className="segmented" role="radiogroup" aria-labelledby="avail-label">
          {Object.entries(AVAILABILITY_LABELS).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={v === value}
              className={`seg seg-${v} ${v === value ? 'on' : ''}`}
              disabled={busy}
              onClick={() => v !== value && run(() => setMyAvailability(v)).then((ok) => ok && onChanged())}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
    </section>
  );
}

function EngineerView({ data, reload }) {
  const c = data.status_counts;
  const p = data.profile;
  return (
    <>
      {p && <AvailabilitySwitch value={p.availability} onChanged={reload} />}
      <div className="stat-grid">
        <StatCard label="New assignments" value={c.assigned ?? 0} tone="info" />
        <StatCard label="In progress" value={c.in_progress ?? 0} tone="warn" />
        <StatCard label="On hold" value={c.on_hold ?? 0} />
        <StatCard
          label="Capacity"
          value={p ? `${p.active_tickets}/${p.max_active_tickets}` : '–'}
          tone={p && p.remaining_capacity <= 0 ? 'danger' : 'ok'}
          hint={
            p
              ? `${AVAILABILITY_LABELS[p.availability]} · ${p.specializations.map(categoryLabel).join(', ')}`
              : 'No engineer profile'
          }
        />
      </div>
      <Section title="My tickets">
        <IncidentTable
          incidents={data.incidents}
          columns={['reporter']}
          empty="No tickets assigned to you right now."
        />
      </Section>
    </>
  );
}

function AdminView({ data }) {
  const c = data.status_counts;
  const a = data.attention;
  const f = data.facilities;
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Unassigned" value={a.unassigned} tone={a.unassigned ? 'danger' : 'ok'} />
        <StatCard label="Escalated" value={a.escalated} tone={a.escalated ? 'danger' : 'ok'} />
        <StatCard
          label="Priority requests"
          value={a.priority_requests}
          tone={a.priority_requests ? 'warn' : 'ok'}
        />
        <StatCard label="Awaiting closure" value={a.awaiting_closure} tone="info" />
        <StatCard label="Active tickets" value={sumCounts(c, ['assigned', 'in_progress', 'on_hold'])} />
      </div>

      <Section title="Needs attention">
        <IncidentTable
          incidents={data.needs_attention}
          columns={['reporter', 'engineer']}
          empty="Nothing needs your attention right now."
        />
      </Section>

      <div className="two-col">
        <Section title="Engineer workload">
          {data.engineers.length ? (
            <ul className="workload-list">
              {data.engineers.map((e) => {
                const pct = Math.min(100, Math.round((e.active_tickets / e.max_active_tickets) * 100));
                return (
                  <li key={e.id}>
                    <div className="workload-head">
                      <strong>{e.name}</strong>
                      <span className={`badge avail-${e.availability}`}>
                        {AVAILABILITY_LABELS[e.availability]}
                      </span>
                    </div>
                    <div className="muted small">{e.specializations.map(categoryLabel).join(', ')}</div>
                    <div className="meter" aria-label={`${e.active_tickets} of ${e.max_active_tickets} tickets`}>
                      <div className={`meter-fill ${pct >= 100 ? 'full' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="muted small">
                      {e.active_tickets} of {e.max_active_tickets} active tickets
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty">No engineer profiles yet.</p>
          )}
        </Section>

        <Section title="Facilities">
          <div className="facility-grid">
            <StatCard label="Buildings" value={f.buildings} />
            <StatCard label="Floors" value={f.floors} />
            <StatCard label="Seats" value={f.seats} />
          </div>
          <h3 className="sub-heading">Tickets by status</h3>
          <ul className="status-breakdown">
            {Object.keys(STATUS_LABELS).map((s) => (
              <li key={s}>
                <StatusBadge status={s} />
                <span>{c[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Recently updated" aside={<a href="#/incidents">View all →</a>}>
        <IncidentTable
          incidents={data.incidents}
          columns={['reporter', 'engineer']}
          empty="No incidents yet."
        />
      </Section>
    </>
  );
}

const VIEWS = { employee: EmployeeView, engineer: EngineerView, facility_admin: AdminView };

const SUBTITLES = {
  employee: 'Track the issues you have reported.',
  engineer: 'Your assigned tickets, highest priority first.',
  facility_admin: 'Overview of all incidents, engineers and facilities.',
};

export default function Dashboard({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getDashboard());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const View = VIEWS[user.role];
  const firstName = user.name?.split(' ')[0] ?? '';

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Hello, {firstName}</h1>
          <p className="muted">{SUBTITLES[user.role]}</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <a className="btn-primary" href="#/incidents/new">Report incident</a>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {!data && loading && <p className="muted">Loading dashboard…</p>}
      {data && View && <View data={data} reload={load} />}
    </>
  );
}

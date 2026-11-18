import { useEffect, useState } from 'react';
import { Section } from '../components/Badges';
import IncidentTable from '../components/IncidentTable';
import { listIncidents } from '../services/incidentService';
import { PRIORITIES, STATUS_LABELS, titleCase } from '../utils/format';

const PAGE_SIZE = 25;

const HEADINGS = {
  employee: ['My incidents', 'Everything you have reported.'],
  engineer: ['My tickets', 'Incidents assigned to you.'],
  facility_admin: ['All incidents', 'Every incident across all facilities.'],
};

export default function IncidentList({ user }) {
  const [filters, setFilters] = useState({ status: '', priority: '', q: '', escalated: false, unassigned: false });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, q: search }));
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listIncidents({
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      q: filters.q.trim() || undefined,
      escalated: filters.escalated || undefined,
      unassigned: filters.unassigned || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFilters((f) => ({ ...f, [field]: value }));
    setPage(0);
  };

  const [title, subtitle] = HEADINGS[user.role] ?? HEADINGS.employee;
  const isAdmin = user.role === 'facility_admin';
  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <a className="btn-primary" href="#/incidents/new">Report incident</a>
      </div>

      <div className="filters">
        <input
          type="search"
          placeholder="Search title or INC-…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search incidents"
        />
        <select value={filters.status} onChange={update('status')} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={filters.priority} onChange={update('priority')} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{titleCase(p)}</option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={filters.escalated} onChange={update('escalated')} />
          Escalated
        </label>
        {isAdmin && (
          <label className="checkbox">
            <input type="checkbox" checked={filters.unassigned} onChange={update('unassigned')} />
            Unassigned
          </label>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <Section
        title={result ? `${total} incident${total === 1 ? '' : 's'}` : 'Incidents'}
        aside={loading && <span className="muted small">Loading…</span>}
      >
        {result && (
          <IncidentTable
            incidents={result.items}
            columns={user.role === 'employee' ? ['engineer'] : ['reporter', 'engineer']}
            empty="No incidents match these filters."
          />
        )}
        {pages > 1 && (
          <div className="pager">
            <button type="button" className="btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ← Previous
            </button>
            <span className="muted small">Page {page + 1} of {pages}</span>
            <button type="button" className="btn-secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              Next →
            </button>
          </div>
        )}
      </Section>
    </>
  );
}

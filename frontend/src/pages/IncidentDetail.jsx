import { useCallback, useEffect, useState } from 'react';
import { PriorityBadge, Section, StatusBadge } from '../components/Badges';
import IncidentForm from '../components/IncidentForm';
import { navigate } from '../router';
import { markAllRead } from '../services/notificationService';
import {
  addNote, assignEngineer, changeStatus, deleteIncident, escalateIncident, getEngineers,
  getIncident, updateIncident,
} from '../services/incidentService';
import {
  AVAILABILITY_LABELS, PRIORITIES, ROLE_LABELS, STATUS_LABELS, categoryLabel, formatDateTime,
  timeAgo, titleCase,
} from '../utils/format';

// Button text for a move to each status, depending on where we are now
function transitionLabel(from, to) {
  if (to === 'in_progress') return from === 'resolved' ? 'Reopen' : from === 'on_hold' ? 'Resume work' : 'Start work';
  return {
    open: 'Move back to open',
    assigned: 'Mark assigned',
    on_hold: 'Put on hold',
    resolved: 'Mark resolved',
    closed: 'Confirm fixed & close',
    cancelled: 'Cancel incident',
  }[to];
}

const DANGER = new Set(['cancelled']);

function historyText(h) {
  const from = (v) => STATUS_LABELS[v] ?? titleCase(v);
  switch (h.event_type) {
    case 'created':
      return 'Reported the incident';
    case 'status_change':
      return `Changed status: ${from(h.from_value)} → ${from(h.to_value)}`;
    case 'assignment':
      return h.from_value ? `Reassigned: ${h.from_value} → ${h.to_value}` : `Assigned to ${h.to_value}`;
    case 'priority_change':
      return `Changed priority: ${titleCase(h.from_value)} → ${titleCase(h.to_value)}`;
    case 'priority_request':
      return `Requested priority ${titleCase(h.to_value)}`;
    case 'escalation':
      return 'Escalated the incident';
    default:
      return titleCase(h.event_type);
  }
}

/* ------------------------------------------------------------------ */

function StatusActions({ incident, run }) {
  const [comment, setComment] = useState('');
  const transitions = incident.permissions.status_transitions;
  if (!transitions.length) return null;

  const go = (to) => {
    if (to === 'cancelled' && !window.confirm('Cancel this incident?')) return;
    run(() => changeStatus(incident.id, to, comment.trim() || undefined)).then((ok) => ok && setComment(''));
  };

  return (
    <div className="action-block">
      <h3>Update status</h3>
      <textarea
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment (added as a note)"
        maxLength={2000}
      />
      <div className="button-row">
        {transitions.map((to) => (
          <button
            key={to}
            type="button"
            className={DANGER.has(to) ? 'btn-danger' : 'btn-primary'}
            onClick={() => go(to)}
          >
            {transitionLabel(incident.status, to)}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssignAction({ incident, run }) {
  const [engineers, setEngineers] = useState(null);
  const [selected, setSelected] = useState(incident.assigned_engineer_id ?? '');

  useEffect(() => {
    getEngineers().then(setEngineers).catch(() => setEngineers([]));
  }, []);

  useEffect(() => setSelected(incident.assigned_engineer_id ?? ''), [incident.assigned_engineer_id]);

  return (
    <div className="action-block">
      <h3>{incident.assigned_engineer_id ? 'Reassign engineer' : 'Assign engineer'}</h3>
      <div className="inline-form">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!engineers}>
          <option value="">{engineers ? 'Select engineer…' : 'Loading…'}</option>
          {engineers?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {AVAILABILITY_LABELS[e.availability]} · {e.active_tickets}/{e.max_active_tickets}
              {e.specializations.includes(incident.category) ? ' ★' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary"
          disabled={!selected || Number(selected) === incident.assigned_engineer_id}
          onClick={() => run(() => assignEngineer(incident.id, Number(selected)))}
        >
          Assign
        </button>
      </div>
      <p className="muted small">★ specialises in {categoryLabel(incident.category)}</p>
    </div>
  );
}

function PriorityAction({ incident, run }) {
  const [priority, setPriority] = useState(incident.requested_priority ?? incident.priority);
  useEffect(
    () => setPriority(incident.requested_priority ?? incident.priority),
    [incident.priority, incident.requested_priority],
  );

  return (
    <div className="action-block">
      <h3>Priority</h3>
      {incident.requested_priority && incident.requested_priority !== incident.priority && (
        <p className="small requested-note">
          Employee requested <strong>{titleCase(incident.requested_priority)}</strong>.
        </p>
      )}
      <div className="inline-form">
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{titleCase(p)}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary"
          disabled={priority === incident.priority}
          onClick={() => run(() => updateIncident(incident.id, { priority }))}
        >
          Set priority
        </button>
      </div>
      {incident.is_escalated && (
        <button
          type="button"
          className="btn-secondary full"
          onClick={() => run(() => updateIncident(incident.id, { is_escalated: false }))}
        >
          Clear escalation
        </button>
      )}
    </div>
  );
}

function EscalateAction({ incident, run }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [requested, setRequested] = useState('');
  const higher = PRIORITIES.slice(PRIORITIES.indexOf(incident.priority) + 1);

  if (!open) {
    return (
      <div className="action-block">
        <h3>Need it sooner?</h3>
        <button type="button" className="btn-secondary full" onClick={() => setOpen(true)}>
          Escalate / request higher priority
        </button>
      </div>
    );
  }

  const submit = () =>
    run(() => escalateIncident(incident.id, reason.trim(), requested)).then((ok) => ok && setOpen(false));

  return (
    <div className="action-block">
      <h3>Escalate incident</h3>
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this urgent?"
        maxLength={2000}
      />
      {higher.length > 0 && (
        <select value={requested} onChange={(e) => setRequested(e.target.value)}>
          <option value="">Keep priority ({titleCase(incident.priority)})</option>
          {higher.map((p) => (
            <option key={p} value={p}>Request {titleCase(p)}</option>
          ))}
        </select>
      )}
      <div className="button-row">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!reason.trim()} onClick={submit}>
          Escalate
        </button>
      </div>
    </div>
  );
}

function Notes({ incident, user, run }) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const p = incident.permissions;

  const submit = (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    run(() => addNote(incident.id, body.trim(), internal)).then((ok) => {
      if (ok) {
        setBody('');
        setInternal(false);
      }
    });
  };

  return (
    <Section title={`Notes (${incident.notes.length})`}>
      {incident.notes.length ? (
        <ul className="notes">
          {incident.notes.map((n) => (
            <li key={n.id} className={`note ${n.author_id === user.id ? 'mine' : ''} ${n.is_internal ? 'internal' : ''}`}>
              <div className="note-head">
                <strong>{n.author_name}</strong>
                <span className="muted small">{ROLE_LABELS[n.author_role]}</span>
                {n.is_internal && <span className="badge internal-badge">Internal</span>}
                <span className="muted small note-time" title={formatDateTime(n.created_at)}>
                  {timeAgo(n.created_at)}
                </span>
              </div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No notes yet.</p>
      )}

      {p.can_add_note ? (
        <form className="note-form" onSubmit={submit}>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note…"
            maxLength={5000}
          />
          <div className="note-form-actions">
            {p.can_add_internal_note ? (
              <label className="checkbox">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal (hidden from employee)
              </label>
            ) : (
              <span />
            )}
            <button type="submit" className="btn-primary" disabled={!body.trim()}>Add note</button>
          </div>
        </form>
      ) : (
        <p className="muted small">Notes are closed for this incident.</p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */

export default function IncidentDetail({ id, user }) {
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setIncident(await getIncident(id));
      // Viewing an incident counts as reading its notifications
      markAllRead(id).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setIncident(null);
    setEditing(false);
    load();
  }, [load]);

  // Run an action that returns the updated incident. Resolves true on success.
  const run = useCallback(async (action) => {
    setBusy(true);
    setActionError('');
    try {
      const updated = await action();
      if (updated) setIncident(updated);
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  if (error) {
    return (
      <>
        <a href="#/incidents" className="back-link">← Incidents</a>
        <div className="alert alert-error" role="alert">{error}</div>
      </>
    );
  }
  if (!incident) return <p className="muted">Loading incident…</p>;

  const p = incident.permissions;
  const hasActions =
    p.status_transitions.length || p.can_assign || p.can_set_priority || p.can_escalate || p.can_delete;

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete ${incident.reference}? This cannot be undone.`)) return;
    if (await run(() => deleteIncident(incident.id))) navigate('/incidents');
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <a href="#/incidents" className="back-link">← Incidents</a>
          <div className="detail-title">
            <span className="ref">{incident.reference}</span>
            <h1>{incident.title}</h1>
          </div>
          <div className="badge-row">
            <StatusBadge status={incident.status} />
            <PriorityBadge priority={incident.priority} requested={incident.requested_priority} />
            {incident.is_escalated && <span className="badge escalated">Escalated</span>}
            <span className="muted small">{categoryLabel(incident.category)}</span>
          </div>
        </div>
        {p.can_edit && !editing && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            Edit details
          </button>
        )}
      </div>

      {actionError && <div className="alert alert-error" role="alert">{actionError}</div>}

      <div className={`detail-grid ${busy ? 'is-busy' : ''}`}>
        <div className="detail-main">
          {editing ? (
            <Section title="Edit details">
              <IncidentForm
                initial={incident}
                showPriority={false}
                submitLabel="Save changes"
                onCancel={() => setEditing(false)}
                onSubmit={async (payload) => {
                  setIncident(await updateIncident(incident.id, payload));
                  setEditing(false);
                }}
              />
            </Section>
          ) : (
            <Section title="Description">
              <p className="description">{incident.description}</p>
              {incident.is_escalated && incident.escalation_reason && (
                <div className="escalation-box">
                  <strong>Escalation reason</strong>
                  <p>{incident.escalation_reason}</p>
                </div>
              )}
            </Section>
          )}

          <Notes incident={incident} user={user} run={run} />

          <Section title="History">
            <ol className="timeline">
              {incident.history.map((h) => (
                <li key={h.id}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <div>{historyText(h)}</div>
                    <div className="muted small">
                      {h.changed_by ?? 'System'} · <span title={formatDateTime(h.created_at)}>{timeAgo(h.created_at)}</span>
                    </div>
                    {h.comment && <div className="small">“{h.comment}”</div>}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="detail-side">
          <Section title="Details">
            <dl className="details">
              <dt>Location</dt>
              <dd>
                {incident.building}
                {incident.floor && <><br />{incident.floor}</>}
                {incident.seat && <><br />Seat {incident.seat}</>}
                {incident.location_details && <><br /><span className="muted">{incident.location_details}</span></>}
              </dd>
              <dt>Reported by</dt>
              <dd>{incident.reported_by}</dd>
              <dt>Engineer</dt>
              <dd>{incident.assigned_engineer ?? <span className="muted">Not assigned yet</span>}</dd>
              <dt>Reported</dt>
              <dd>{formatDateTime(incident.created_at)}</dd>
              <dt>Last update</dt>
              <dd>{formatDateTime(incident.updated_at)}</dd>
              {incident.resolved_at && (<><dt>Resolved</dt><dd>{formatDateTime(incident.resolved_at)}</dd></>)}
              {incident.closed_at && (<><dt>Closed</dt><dd>{formatDateTime(incident.closed_at)}</dd></>)}
            </dl>
          </Section>

          {hasActions ? (
            <Section title="Actions">
              <StatusActions incident={incident} run={run} />
              {p.can_assign && <AssignAction incident={incident} run={run} />}
              {p.can_set_priority && <PriorityAction incident={incident} run={run} />}
              {p.can_escalate && <EscalateAction incident={incident} run={run} />}
              {p.can_delete && (
                <div className="action-block">
                  <button type="button" className="btn-danger full" onClick={handleDelete}>
                    Delete incident
                  </button>
                </div>
              )}
            </Section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

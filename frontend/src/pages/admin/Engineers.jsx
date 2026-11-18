import { useCallback, useEffect, useState } from 'react';
import { Section } from '../../components/Badges';
import useAction from '../../hooks/useAction';
import { createEngineer, listEngineers, updateEngineer } from '../../services/adminService';
import { getFacilities } from '../../services/incidentService';
import { AVAILABILITY_LABELS, CATEGORIES, categoryLabel } from '../../utils/format';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

const EMPTY = {
  name: '',
  email: '',
  password: '',
  phone: '',
  department: 'Facilities',
  specializations: [],
  max_active_tickets: 5,
  availability: 'available',
  home_building_id: '',
  notes: '',
  is_active: true,
};

function EngineerForm({ engineer, buildings, onSubmit, onCancel }) {
  const isNew = !engineer;
  const [form, setForm] = useState(() =>
    isNew
      ? EMPTY
      : {
          ...EMPTY,
          ...Object.fromEntries(Object.entries(engineer).map(([k, v]) => [k, v ?? ''])),
          specializations: engineer.specializations ?? [],
        },
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };
  const toggleSpec = (c) =>
    setForm((f) => ({
      ...f,
      specializations: f.specializations.includes(c)
        ? f.specializations.filter((x) => x !== c)
        : [...f.specializations, c],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Enter the engineer’s name.');
    if (isNew && !form.email.trim().toLowerCase().endsWith('@acme.inc')) {
      return setError('Use an @acme.inc email address.');
    }
    if (isNew && form.password.length < 8) return setError('The temporary password needs at least 8 characters.');

    const body = {
      name: form.name.trim(),
      phone: blankToNull(form.phone),
      department: blankToNull(form.department),
      specializations: form.specializations,
      max_active_tickets: Number(form.max_active_tickets),
      availability: form.availability,
      home_building_id: form.home_building_id === '' ? null : Number(form.home_building_id),
      notes: blankToNull(form.notes),
    };
    if (isNew) Object.assign(body, { email: form.email.trim().toLowerCase(), password: form.password });
    else body.is_active = form.is_active;

    setSaving(true);
    try {
      await onSubmit(body);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="form compact" onSubmit={submit} noValidate>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field-row">
        <label className="field">
          <span>Full name</span>
          <input id="eng-name" value={form.name} onChange={set('name')} maxLength={150} />
        </label>
        {isNew ? (
          <label className="field">
            <span>Work email</span>
            <input id="eng-email" type="email" value={form.email} onChange={set('email')} placeholder="name@acme.inc" />
          </label>
        ) : (
          <label className="field">
            <span>Work email</span>
            <input id="eng-email" value={engineer.email} disabled />
          </label>
        )}
      </div>

      {isNew && (
        <label className="field">
          <span>Temporary password</span>
          <input id="eng-password" type="text" value={form.password} onChange={set('password')} placeholder="At least 8 characters — share it with the engineer" autoComplete="off" />
        </label>
      )}

      <fieldset className="field-group">
        <legend>Specialisations</legend>
        <div className="chip-checks">
          {CATEGORIES.map((c) => (
            <label key={c} className={`chip-check ${form.specializations.includes(c) ? 'on' : ''}`}>
              <input type="checkbox" checked={form.specializations.includes(c)} onChange={() => toggleSpec(c)} />
              {categoryLabel(c)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field-row three">
        <label className="field">
          <span>Availability</span>
          <select id="eng-availability" value={form.availability} onChange={set('availability')}>
            {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Max active tickets</span>
          <input id="eng-max" type="number" min={1} max={50} value={form.max_active_tickets} onChange={set('max_active_tickets')} />
        </label>
        <label className="field">
          <span>Home building</span>
          <select id="eng-home" value={form.home_building_id} onChange={set('home_building_id')}>
            <option value="">—</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Phone <em>(optional)</em></span>
          <input id="eng-phone" value={form.phone} onChange={set('phone')} maxLength={30} />
        </label>
        <label className="field">
          <span>Department <em>(optional)</em></span>
          <input id="eng-dept" value={form.department} onChange={set('department')} maxLength={100} />
        </label>
      </div>

      <label className="field">
        <span>Notes <em>(optional)</em></span>
        <textarea id="eng-notes" rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} />
      </label>

      {!isNew && (
        <label className="checkbox">
          <input id="eng-active" type="checkbox" checked={form.is_active} onChange={set('is_active')} />
          Account active (unticking signs them out; only possible with no active tickets)
        </label>
      )}

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Create engineer' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

export default function Engineers() {
  const [engineers, setEngineers] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | engineer id
  const [notice, setNotice] = useState('');
  const { run, error } = useAction();

  const load = useCallback(
    () => run(async () => setEngineers(await listEngineers(includeInactive))),
    [run, includeInactive],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getFacilities().then(setBuildings).catch(() => setBuildings([]));
  }, []);

  const current = typeof editing === 'number' ? engineers?.find((e) => e.id === editing) : null;

  const save = async (body) => {
    if (editing === 'new') {
      const created = await createEngineer(body);
      setNotice(`${created.name} can now sign in as ${created.email} with the temporary password.`);
    } else {
      const updated = await updateEngineer(editing, body);
      setNotice(`Saved ${updated.name}.`);
    }
    setEditing(null);
    await load();
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Engineers</h1>
          <p className="muted">Engineer profiles, specialisations, availability and current workload.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => { setEditing('new'); setNotice(''); }}>
          Add engineer
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {editing !== null && (editing === 'new' || current) && (
        <Section title={editing === 'new' ? 'New engineer' : `Edit ${current.name}`}>
          <EngineerForm
            key={editing}
            engineer={current}
            buildings={buildings}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </Section>
      )}

      <Section
        title={engineers ? `${engineers.length} engineer${engineers.length === 1 ? '' : 's'}` : 'Engineers'}
        aside={
          <label className="checkbox">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
        }
      >
        {!engineers ? (
          <p className="muted">Loading engineers…</p>
        ) : engineers.length === 0 ? (
          <p className="empty">No engineers yet. Add the first one.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Engineer</th>
                  <th>Specialisations</th>
                  <th>Availability</th>
                  <th>Workload</th>
                  <th>Home building</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {engineers.map((e) => {
                  const pct = Math.min(100, Math.round((e.active_tickets / e.max_active_tickets) * 100));
                  return (
                    <tr key={e.id} className={e.is_active ? '' : 'is-inactive'}>
                      <td>
                        <strong>{e.name}</strong>
                        {!e.is_active && <span className="badge tag-inactive">Inactive</span>}
                        <div className="muted small">{e.email}</div>
                      </td>
                      <td className="small">
                        {e.specializations.length ? e.specializations.map(categoryLabel).join(', ') : <span className="muted">—</span>}
                      </td>
                      <td><span className={`badge avail-${e.availability}`}>{AVAILABILITY_LABELS[e.availability]}</span></td>
                      <td className="workload-cell">
                        <div className="meter"><div className={`meter-fill ${pct >= 100 ? 'full' : ''}`} style={{ width: `${pct}%` }} /></div>
                        <span className="small muted">{e.active_tickets} / {e.max_active_tickets}</span>
                      </td>
                      <td className="small">{e.home_building ?? <span className="muted">—</span>}</td>
                      <td className="row-actions">
                        <button type="button" className="btn-link strong" onClick={() => { setEditing(e.id); setNotice(''); }}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

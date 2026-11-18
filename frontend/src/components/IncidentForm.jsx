import { useEffect, useMemo, useState } from 'react';
import { getFacilities } from '../services/incidentService';
import { CATEGORIES, PRIORITIES, categoryLabel, titleCase } from '../utils/format';

const EMPTY = {
  title: '',
  description: '',
  category: '',
  priority: 'medium',
  building_id: '',
  floor_id: '',
  seat_id: '',
  location_details: '',
};

const toId = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * Create / edit form. `initial` pre-fills for edits; `showPriority` controls
 * whether the priority picker appears; `allowCritical` is for admins.
 */
export default function IncidentForm({
  initial,
  submitLabel = 'Submit',
  showPriority = true,
  allowCritical = false,
  onSubmit,
  onCancel,
}) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ''])),
  }));
  const [facilities, setFacilities] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFacilities()
      .then(setFacilities)
      .catch((err) => setError(err.message));
  }, []);

  const building = useMemo(
    () => facilities?.find((b) => b.id === Number(form.building_id)),
    [facilities, form.building_id],
  );
  const floor = building?.floors.find((f) => f.id === Number(form.floor_id));

  const set = (field) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Changing a parent location clears its children
      if (field === 'building_id') Object.assign(next, { floor_id: '', seat_id: '' });
      if (field === 'floor_id') next.seat_id = '';
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.description.trim() || !form.category || !form.building_id) {
      setError('Please fill in the title, description, category and building.');
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      building_id: toId(form.building_id),
      floor_id: toId(form.floor_id),
      seat_id: toId(form.seat_id),
      location_details: form.location_details.trim() || null,
    };
    if (showPriority) payload.priority = form.priority;

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const priorities = allowCritical ? PRIORITIES : PRIORITIES.filter((p) => p !== 'critical');

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <label className="field">
        <span>Title</span>
        <input
          value={form.title}
          onChange={set('title')}
          maxLength={200}
          placeholder="e.g. Air conditioning not working"
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={5}
          value={form.description}
          onChange={set('description')}
          maxLength={5000}
          placeholder="What's wrong, since when, and how it affects you"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Category</span>
          <select value={form.category} onChange={set('category')}>
            <option value="">Select…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </label>
        {showPriority && (
          <label className="field">
            <span>Priority</span>
            <select value={form.priority} onChange={set('priority')}>
              {priorities.map((p) => (
                <option key={p} value={p}>{titleCase(p)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <fieldset className="field-group">
        <legend>Location</legend>
        <div className="field-row three">
          <label className="field">
            <span>Building</span>
            <select value={form.building_id} onChange={set('building_id')} disabled={!facilities}>
              <option value="">{facilities ? 'Select…' : 'Loading…'}</option>
              {facilities?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Floor <em>(optional)</em></span>
            <select value={form.floor_id} onChange={set('floor_id')} disabled={!building}>
              <option value="">—</option>
              {building?.floors.map((f) => (
                <option key={f.id} value={f.id}>{f.name || `Floor ${f.floor_number}`}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Seat <em>(optional)</em></span>
            <select value={form.seat_id} onChange={set('seat_id')} disabled={!floor?.seats.length}>
              <option value="">—</option>
              {floor?.seats.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.seat_code}{s.description ? ` – ${s.description}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>More details <em>(optional)</em></span>
          <input
            value={form.location_details}
            onChange={set('location_details')}
            maxLength={255}
            placeholder="e.g. Kitchen next to lift B"
          />
        </label>
      </fieldset>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

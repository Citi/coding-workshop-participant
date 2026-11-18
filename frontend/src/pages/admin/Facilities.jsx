import { useCallback, useEffect, useState } from 'react';
import { Section } from '../../components/Badges';
import useAction from '../../hooks/useAction';
import {
  createBuilding, createFloor, createSeat, deleteBuilding, deleteFloor, deleteSeat,
  getFacilitiesTree, updateBuilding, updateFloor, updateSeat,
} from '../../services/adminService';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

function ActiveTag({ active }) {
  return active ? null : <span className="badge tag-inactive">Inactive</span>;
}

/* ------------------------------------------------------------ buildings */

const EMPTY_BUILDING = { code: '', name: '', address: '', city: '', country: '' };

function BuildingForm({ initial = EMPTY_BUILDING, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_BUILDING,
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])),
  }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      code: form.code.trim(),
      name: form.name.trim(),
      address: blankToNull(form.address),
      city: blankToNull(form.city),
      country: blankToNull(form.country),
    });
  };
  return (
    <form className="form compact" onSubmit={submit}>
      <div className="field-row">
        <label className="field">
          <span>Code</span>
          <input id="bld-code" value={form.code} onChange={set('code')} maxLength={20} placeholder="HQ2" required />
        </label>
        <label className="field">
          <span>Name</span>
          <input id="bld-name" value={form.name} onChange={set('name')} maxLength={150} placeholder="ACME North Campus" required />
        </label>
      </div>
      <label className="field">
        <span>Address <em>(optional)</em></span>
        <input id="bld-address" value={form.address} onChange={set('address')} maxLength={255} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>City <em>(optional)</em></span>
          <input id="bld-city" value={form.city} onChange={set('city')} maxLength={100} />
        </label>
        <label className="field">
          <span>Country <em>(optional)</em></span>
          <input id="bld-country" value={form.country} onChange={set('country')} maxLength={100} />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!form.code.trim() || !form.name.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ seats */

function SeatRow({ seat, run }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(seat.seat_code);
  const [desc, setDesc] = useState(seat.description ?? '');

  if (editing) {
    return (
      <tr>
        <td><input aria-label="Seat code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} /></td>
        <td><input aria-label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={255} /></td>
        <td />
        <td className="row-actions">
          <button type="button" className="btn-link" onClick={() => setEditing(false)}>Cancel</button>
          <button
            type="button"
            className="btn-link strong"
            disabled={!code.trim()}
            onClick={async () => {
              if (await run(() => updateSeat(seat.id, { seat_code: code.trim(), description: blankToNull(desc) }))) {
                setEditing(false);
              }
            }}
          >
            Save
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={seat.is_active ? '' : 'is-inactive'}>
      <td className="mono">{seat.seat_code}</td>
      <td>{seat.description || <span className="muted">—</span>}</td>
      <td><ActiveTag active={seat.is_active} /></td>
      <td className="row-actions">
        <button type="button" className="btn-link" onClick={() => setEditing(true)}>Edit</button>
        <button
          type="button"
          className="btn-link"
          onClick={() => run(() => updateSeat(seat.id, { is_active: !seat.is_active }))}
        >
          {seat.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
        <button
          type="button"
          className="btn-link danger"
          onClick={() => window.confirm(`Delete seat ${seat.seat_code}?`) && run(() => deleteSeat(seat.id))}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function AddSeat({ floorId, run }) {
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => createSeat({ floor_id: floorId, seat_code: code.trim(), description: blankToNull(desc) }))) {
      setCode('');
      setDesc('');
    }
  };
  return (
    <form className="inline-add" onSubmit={submit}>
      <input aria-label="New seat code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Seat code, e.g. 3A-042" maxLength={30} />
      <input aria-label="New seat description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" maxLength={255} />
      <button type="submit" className="btn-secondary" disabled={!code.trim()}>Add seat</button>
    </form>
  );
}

/* ------------------------------------------------------------ floors */

function FloorBlock({ floor, run }) {
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState(String(floor.floor_number));
  const [name, setName] = useState(floor.name ?? '');
  const activeSeats = floor.seats.filter((s) => s.is_active).length;

  return (
    <div className={`floor-block ${floor.is_active ? '' : 'is-inactive'}`}>
      <div className="floor-head">
        {editing ? (
          <div className="inline-add">
            <input aria-label="Floor number" type="number" value={number} onChange={(e) => setNumber(e.target.value)} className="num" />
            <input aria-label="Floor name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Floor name" maxLength={100} />
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={number === ''}
              onClick={async () => {
                if (await run(() => updateFloor(floor.id, { floor_number: Number(number), name: blankToNull(name) }))) {
                  setEditing(false);
                }
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <>
            <div className="floor-title">
              <strong>Floor {floor.floor_number}</strong>
              {floor.name && <span className="muted">{floor.name}</span>}
              <ActiveTag active={floor.is_active} />
              <span className="muted small">{activeSeats} active seat{activeSeats === 1 ? '' : 's'}</span>
            </div>
            <div className="row-actions">
              <button type="button" className="btn-link" onClick={() => setEditing(true)}>Edit</button>
              <button
                type="button"
                className="btn-link"
                onClick={() => run(() => updateFloor(floor.id, { is_active: !floor.is_active }))}
              >
                {floor.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
              <button
                type="button"
                className="btn-link danger"
                onClick={() =>
                  window.confirm(`Delete floor ${floor.floor_number} and its seats?`) && run(() => deleteFloor(floor.id))
                }
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {floor.seats.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Seat</th><th>Description</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {floor.seats.map((s) => <SeatRow key={s.id} seat={s} run={run} />)}
            </tbody>
          </table>
        </div>
      )}
      <AddSeat floorId={floor.id} run={run} />
    </div>
  );
}

function AddFloor({ buildingId, run }) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => createFloor({ building_id: buildingId, floor_number: Number(number), name: blankToNull(name) }))) {
      setNumber('');
      setName('');
    }
  };
  return (
    <form className="inline-add add-floor" onSubmit={submit}>
      <input aria-label="New floor number" type="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="No." className="num" />
      <input aria-label="New floor name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Third Floor - Sales" maxLength={100} />
      <button type="submit" className="btn-primary" disabled={number === ''}>Add floor</button>
    </form>
  );
}

/* ------------------------------------------------------------ page */

export default function Facilities() {
  const [tree, setTree] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // view | new | edit
  const [loadError, setLoadError] = useState('');
  const { run: runRaw, busy, error, setError } = useAction();

  const load = useCallback(async () => {
    try {
      const data = await getFacilitiesTree();
      setTree(data);
      setSelectedId((id) => (data.some((b) => b.id === id) ? id : data[0]?.id ?? null));
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Every change reloads the tree so counts and states stay accurate
  const run = useCallback(
    async (fn) => {
      const result = await runRaw(fn);
      if (result !== undefined) await load();
      return result;
    },
    [runRaw, load],
  );

  const building = tree?.find((b) => b.id === selectedId);

  const select = (id) => {
    setSelectedId(id);
    setMode('view');
    setError('');
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Facilities</h1>
          <p className="muted">Buildings, floors and seats that employees can pick when reporting an incident.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => { setMode('new'); setError(''); }}>
          Add building
        </button>
      </div>

      {(loadError || error) && <div className="alert alert-error" role="alert">{loadError || error}</div>}
      {!tree && !loadError && <p className="muted">Loading facilities…</p>}

      {tree && (
        <div className={`admin-split ${busy ? 'is-busy' : ''}`}>
          <Section title={`Buildings (${tree.length})`}>
            {tree.length ? (
              <ul className="pick-list">
                {tree.map((b) => {
                  const floors = b.floors.filter((f) => f.is_active).length;
                  const seats = b.floors.reduce((n, f) => n + f.seats.filter((s) => s.is_active).length, 0);
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        className={`pick ${b.id === selectedId && mode !== 'new' ? 'selected' : ''} ${b.is_active ? '' : 'is-inactive'}`}
                        onClick={() => select(b.id)}
                      >
                        <span className="pick-title">
                          <span className="mono small">{b.code}</span> {b.name}
                        </span>
                        <span className="muted small">
                          {floors} floor{floors === 1 ? '' : 's'} · {seats} seat{seats === 1 ? '' : 's'}
                          {!b.is_active && ' · inactive'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">No buildings yet. Add the first one.</p>
            )}
          </Section>

          <div className="admin-detail">
            {mode === 'new' && (
              <Section title="New building">
                <BuildingForm
                  submitLabel="Create building"
                  onCancel={() => setMode('view')}
                  onSubmit={async (body) => {
                    const created = await run(() => createBuilding(body));
                    if (created) {
                      setSelectedId(created.id);
                      setMode('view');
                    }
                  }}
                />
              </Section>
            )}

            {mode !== 'new' && building && (
              <Section
                title={
                  <span className="detail-heading">
                    <span className="mono small muted">{building.code}</span> {building.name}
                    <ActiveTag active={building.is_active} />
                  </span>
                }
                aside={
                  mode === 'view' && (
                    <div className="row-actions">
                      <button type="button" className="btn-secondary" onClick={() => setMode('edit')}>Edit</button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => run(() => updateBuilding(building.id, { is_active: !building.is_active }))}
                      >
                        {building.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() =>
                          window.confirm(`Delete ${building.name} with all its floors and seats?`) &&
                          run(() => deleteBuilding(building.id))
                        }
                      >
                        Delete
                      </button>
                    </div>
                  )
                }
              >
                {mode === 'edit' ? (
                  <BuildingForm
                    key={building.id}
                    initial={building}
                    submitLabel="Save changes"
                    onCancel={() => setMode('view')}
                    onSubmit={async (body) => {
                      if (await run(() => updateBuilding(building.id, body))) setMode('view');
                    }}
                  />
                ) : (
                  <>
                    {(building.address || building.city || building.country) && (
                      <p className="muted small address">
                        {[building.address, building.city, building.country].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {!building.is_active && (
                      <p className="hint">Inactive buildings are hidden from the report form. Existing incidents keep their location.</p>
                    )}
                    <div className="floors">
                      {building.floors.length ? (
                        building.floors.map((f) => <FloorBlock key={f.id} floor={f} run={run} />)
                      ) : (
                        <p className="empty">No floors yet.</p>
                      )}
                    </div>
                    <AddFloor buildingId={building.id} run={run} />
                  </>
                )}
              </Section>
            )}

            <p className="hint">
              Deleting only works while no incident uses the building, floor or seat. Otherwise deactivate it: it
              disappears from the report form but stays on existing incidents.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

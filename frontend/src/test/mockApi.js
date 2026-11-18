import { vi } from 'vitest';

/**
 * Replace window.fetch with a fake backend.
 *
 *   const api = mockApi({
 *     'GET /facilities': [...],                       // 200 with this JSON
 *     'POST /incidents': (body) => ({ id: 9, ...body }),
 *     'GET /incidents/404': { status: 404, body: { message: 'Incident not found.' } },
 *   });
 *   api.calls  -> [{ method, path, query, body, headers }]
 *
 * Paths are matched without the /api/api-service prefix and query string.
 * Unmatched requests fail the test loudly.
 */
export function mockApi(routes = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init = {}) => {
    const { pathname, search } = new URL(url);
    const path = pathname.replace(/^\/api\/api-service/, '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, query: new URLSearchParams(search), body, headers: init.headers });

    const key = `${method} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request: ${key}`);
    let spec = routes[key];
    if (typeof spec === 'function') spec = spec(body);
    const isFull = spec && typeof spec === 'object' && 'status' in spec && 'body' in spec;
    const status = isFull ? spec.status : 200;
    const payload = isFull ? spec.body : spec;
    return new Response(status === 204 ? null : JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetch: fetchMock };
}

export const FACILITIES = [
  {
    id: 1, code: 'HQ1', name: 'ACME Headquarters', is_active: true,
    floors: [
      { id: 10, building_id: 1, floor_number: 1, name: 'First Floor', is_active: true,
        seats: [{ id: 100, floor_id: 10, seat_code: '1A-001', description: 'Window', is_active: true }] },
      { id: 11, building_id: 1, floor_number: 2, name: '', is_active: true, seats: [] },
    ],
  },
  { id: 2, code: 'INN', name: 'Innovation Hub', is_active: true, floors: [] },
];

export const USERS = {
  employee: { id: 6, name: 'Emma Employee', email: 'emma@acme.inc', role: 'employee' },
  engineer: { id: 2, name: 'Ethan Electrics', email: 'ethan.eng@acme.inc', role: 'engineer' },
  admin: { id: 1, name: 'Alice Admin', email: 'alice.admin@acme.inc', role: 'facility_admin' },
};

const NO_PERMISSIONS = {
  can_edit: false, can_set_priority: false, can_assign: false, can_escalate: false,
  can_add_note: false, can_add_internal_note: false, can_delete: false, status_transitions: [],
};

export function incident(overrides = {}) {
  const { permissions, ...rest } = overrides;
  return {
    id: 4, reference: 'INC-000004', title: 'Air conditioning not cooling',
    description: 'Warm air since this morning.', category: 'hvac', priority: 'medium',
    status: 'in_progress', requested_priority: null, is_escalated: false,
    created_at: '2026-11-15T09:00:00Z', updated_at: '2026-11-17T09:00:00Z',
    building: 'ACME Headquarters', floor: 'First Floor', seat: '1A-001', location_details: null,
    reported_by: 'Emma Employee', assigned_engineer: 'Ethan Electrics',
    building_id: 1, floor_id: 10, seat_id: 100, reported_by_id: 6, assigned_engineer_id: 2,
    assigned_at: null, escalation_reason: null, escalated_at: null, resolved_at: null, closed_at: null,
    notes: [], history: [],
    permissions: { ...NO_PERMISSIONS, ...permissions },
    ...rest,
  };
}

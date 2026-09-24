/** Ticket list items shaped like GET /api/core/tickets responses (which never include priority). */

export function makeTicket(overrides = {}) {
  return {
    ticket_id: 1,
    title: 'Wi-Fi keeps dropping',
    category: 'network',
    status: 'open',
    affected_scope: 'me',
    escalation_requested: false,
    building_id: 1,
    building_name: 'Building A',
    floor_id: 3,
    floor_number: 3,
    seat_id: 3,
    seat_number: '301',
    created_at: '2026-09-22T10:00:00-04:00',
    updated_at: '2026-09-22T10:00:00-04:00',
    ...overrides,
  }
}

/** Newest update first, as the API returns them. */
export const TICKETS = [
  makeTicket({
    ticket_id: 5,
    title: 'Printer jam',
    category: 'printer',
    status: 'in_progress',
    affected_scope: 'floor',
    floor_number: 2,
    seat_id: null,
    seat_number: null,
    updated_at: '2026-09-22T12:00:00-04:00',
  }),
  makeTicket({ ticket_id: 2, title: 'Old lamp', status: 'closed', updated_at: '2026-09-22T11:30:00-04:00' }),
  makeTicket({
    ticket_id: 4,
    title: 'Lobby doors',
    status: 'blocked',
    affected_scope: 'building',
    building_name: 'Building B',
    floor_number: null,
    seat_number: null,
    updated_at: '2026-09-22T11:00:00-04:00',
  }),
  makeTicket({ ticket_id: 1, updated_at: '2026-09-22T10:00:00-04:00' }),
]

/** A row shaped like GET /api/core/admin/tickets: the employee row plus triage fields. */
export function makeAdminTicket(overrides = {}) {
  return makeTicket({
    priority: 'P3',
    created_by_user_id: 1,
    created_by_name: 'Jane Doe',
    assigned_to_user_id: null,
    assigned_to_name: null,
    ...overrides,
  })
}

/** Every employee's tickets in the API's triage order: P1 first, then the oldest. */
export const ADMIN_TICKETS = [
  makeAdminTicket({
    ticket_id: 7,
    title: 'Lobby lights out',
    category: 'electrical',
    affected_scope: 'building',
    priority: 'P1',
    building_id: 2,
    building_name: 'Building B',
    floor_id: null,
    floor_number: null,
    seat_id: null,
    seat_number: null,
    created_by_user_id: 2,
    created_by_name: 'Eve Other',
    created_at: '2026-09-22T09:00:00-04:00',
  }),
  makeAdminTicket({
    ticket_id: 5,
    title: 'Printer jam',
    category: 'printer',
    status: 'in_progress',
    affected_scope: 'floor',
    priority: 'P2',
    floor_number: 2,
    seat_id: null,
    seat_number: null,
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T08:00:00-04:00',
  }),
  makeAdminTicket({ ticket_id: 1, escalation_requested: true, created_at: '2026-09-22T07:00:00-04:00' }),
  makeAdminTicket({
    ticket_id: 2,
    title: 'Old lamp',
    category: 'electrical',
    status: 'closed',
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T06:00:00-04:00',
  }),
]

/** GET /api/core/admin/engineers: lightest load first. Sam already has ticket #5 (ADMIN_TICKETS). */
export const ENGINEERS = [
  {
    user_id: 6,
    full_name: 'Kim Fixit',
    email: 'kim@acme.inc',
    active_count: 0,
    open_count: 0,
    in_progress_count: 0,
    blocked_count: 0,
    p1_count: 0,
  },
  {
    user_id: 4,
    full_name: 'Sam Tech',
    email: 'sam@acme.inc',
    active_count: 3,
    open_count: 1,
    in_progress_count: 1,
    blocked_count: 1,
    p1_count: 1,
  },
]

/** GET /api/core/admin/users: everyone by name, with their role and active tickets. */
export const USERS = [
  { user_id: 5, email: 'alex@acme.inc', full_name: 'Alex Admin', phone_number: null, role: 'admin', created_at: '2026-09-20T09:00:00-04:00', active_ticket_count: 0 },
  { user_id: 1, email: 'jane@acme.inc', full_name: 'Jane Doe', phone_number: null, role: 'employee', created_at: '2026-09-20T09:00:00-04:00', active_ticket_count: 0 },
  { user_id: 6, email: 'kim@acme.inc', full_name: 'Kim Fixit', phone_number: null, role: 'engineer', created_at: '2026-09-20T09:00:00-04:00', active_ticket_count: 0 },
  { user_id: 4, email: 'sam@acme.inc', full_name: 'Sam Tech', phone_number: null, role: 'engineer', created_at: '2026-09-20T09:00:00-04:00', active_ticket_count: 3 },
]

/**
 * GET /api/core/engineer/tickets?view=active for Sam (user 4): his tickets in triage
 * order (P1 first, then oldest). #9 is the one he touched most recently.
 */
export const QUEUE = [
  makeAdminTicket({
    ticket_id: 7,
    title: 'Lobby lights out',
    category: 'electrical',
    affected_scope: 'building',
    priority: 'P1',
    building_id: 2,
    building_name: 'Building B',
    floor_id: null,
    floor_number: null,
    seat_id: null,
    seat_number: null,
    created_by_name: 'Eve Other',
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T08:00:00-04:00',
    updated_at: '2026-09-22T08:30:00-04:00',
  }),
  makeAdminTicket({
    ticket_id: 5,
    title: 'Printer jam',
    category: 'printer',
    status: 'in_progress',
    affected_scope: 'floor',
    priority: 'P2',
    floor_number: 2,
    seat_id: null,
    seat_number: null,
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T09:00:00-04:00',
    updated_at: '2026-09-22T10:00:00-04:00',
  }),
  makeAdminTicket({
    ticket_id: 9,
    title: 'Wi-Fi keeps dropping',
    status: 'in_progress',
    escalation_requested: true,
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T10:00:00-04:00',
    updated_at: '2026-09-22T11:00:00-04:00',
  }),
  makeAdminTicket({
    ticket_id: 11,
    title: 'Door sticks',
    category: 'building_facilities',
    status: 'blocked',
    assigned_to_user_id: 4,
    assigned_to_name: 'Sam Tech',
    created_at: '2026-09-22T11:00:00-04:00',
    updated_at: '2026-09-22T11:30:00-04:00',
  }),
]

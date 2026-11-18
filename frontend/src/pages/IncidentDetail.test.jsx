import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { USERS, incident, mockApi } from '../test/mockApi';
import IncidentDetail from './IncidentDetail';

const NOTES = [
  { id: 1, body: 'Refrigerant is low.', is_internal: false, created_at: '2026-11-16T10:00:00Z', author_id: 2, author_name: 'Ethan Electrics', author_role: 'engineer' },
];
const HISTORY = [
  { id: 1, event_type: 'created', from_value: null, to_value: 'open', comment: null, changed_by: 'Emma Employee', created_at: '2026-11-15T09:00:00Z' },
  { id: 2, event_type: 'assignment', from_value: null, to_value: 'Ethan Electrics', comment: null, changed_by: 'Alice Admin', created_at: '2026-11-15T10:00:00Z' },
  { id: 3, event_type: 'status_change', from_value: 'assigned', to_value: 'in_progress', comment: null, changed_by: 'Ethan Electrics', created_at: '2026-11-15T11:00:00Z' },
];

function setup(inc, extraRoutes = {}) {
  const api = mockApi({
    [`GET /incidents/${inc.id}`]: inc,
    'POST /notifications/read-all': { unread_count: 0 },
    'GET /engineers': [
      { id: 2, name: 'Ethan Electrics', availability: 'available', active_tickets: 1, max_active_tickets: 5, specializations: ['hvac'] },
      { id: 4, name: 'Tom Tech', availability: 'busy', active_tickets: 2, max_active_tickets: 6, specializations: [] },
    ],
    ...extraRoutes,
  });
  return api;
}

describe('IncidentDetail', () => {
  it('shows the incident, notes and readable history, and marks notifications read', async () => {
    const api = setup(incident({ notes: NOTES, history: HISTORY }));
    render(<IncidentDetail id={4} user={USERS.employee} />);

    expect(await screen.findByRole('heading', { name: 'Air conditioning not cooling' })).toBeInTheDocument();
    expect(screen.getByText('Refrigerant is low.')).toBeInTheDocument();
    expect(screen.getByText('Assigned to Ethan Electrics')).toBeInTheDocument();
    expect(screen.getByText('Changed status: Assigned → In progress')).toBeInTheDocument();
    const readAll = api.calls.find((c) => c.path === '/notifications/read-all');
    expect(readAll.query.get('incident_id')).toBe('4');
  });

  it('employee on a ticket in progress sees no admin actions', async () => {
    setup(incident({ permissions: { can_add_note: true } }));
    render(<IncidentDetail id={4} user={USERS.employee} />);
    await screen.findByRole('heading', { name: 'Air conditioning not cooling' });

    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Internal/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
  });

  it('admin sees assign, priority and delete', async () => {
    setup(incident({
      permissions: { can_edit: true, can_assign: true, can_set_priority: true, can_delete: true,
                     can_add_note: true, can_add_internal_note: true, status_transitions: ['on_hold', 'resolved'] },
    }));
    render(<IncidentDetail id={4} user={USERS.admin} />);
    await screen.findByRole('heading', { name: 'Actions' });

    expect(screen.getByRole('heading', { name: 'Reassign engineer' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /Tom Tech · Busy · 2\/6/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set priority' })).toBeDisabled(); // unchanged
    expect(screen.getByRole('button', { name: 'Delete incident' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Put on hold' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Internal/)).toBeInTheDocument();
  });

  it('changes status with an optional comment and shows the result', async () => {
    const user = userEvent.setup();
    const api = setup(incident({ permissions: { status_transitions: ['on_hold', 'resolved'] } }), {
      'POST /incidents/4/status': (body) => incident({ status: body.status }),
    });
    render(<IncidentDetail id={4} user={USERS.engineer} />);

    await user.type(await screen.findByPlaceholderText(/Optional comment/), 'Fixed the compressor');
    await user.click(screen.getByRole('button', { name: 'Mark resolved' }));

    expect(api.calls.at(-1).body).toEqual({ status: 'resolved', comment: 'Fixed the compressor' });
    expect(await screen.findByText('Resolved', { selector: '.badge' })).toBeInTheDocument();
  });

  it('asks before cancelling', async () => {
    const user = userEvent.setup();
    const api = setup(incident({ status: 'open', permissions: { status_transitions: ['cancelled'] } }));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<IncidentDetail id={4} user={USERS.employee} />);

    await user.click(await screen.findByRole('button', { name: 'Cancel incident' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.calls.some((c) => c.path === '/incidents/4/status')).toBe(false);
  });

  it('adds an internal note as an engineer', async () => {
    const user = userEvent.setup();
    const api = setup(incident({ permissions: { can_add_note: true, can_add_internal_note: true } }), {
      'POST /incidents/4/notes': (body) => incident({ notes: [{ ...NOTES[0], id: 2, body: body.body, is_internal: true }],
                                                     permissions: { can_add_note: true, can_add_internal_note: true } }),
    });
    render(<IncidentDetail id={4} user={USERS.engineer} />);

    await user.type(await screen.findByPlaceholderText('Write a note…'), 'Supplier PO #4471');
    await user.click(screen.getByLabelText(/Internal/));
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    expect(api.calls.at(-1).body).toEqual({ body: 'Supplier PO #4471', is_internal: true });
    const note = (await screen.findByText('Supplier PO #4471')).closest('li');
    expect(within(note).getByText('Internal')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write a note…')).toHaveValue('');
  });

  it('lets the reporter escalate and request a higher priority', async () => {
    const user = userEvent.setup();
    const api = setup(incident({ permissions: { can_escalate: true } }), {
      'POST /incidents/4/escalate': incident({ is_escalated: true, escalation_reason: 'Board meeting', requested_priority: 'critical' }),
    });
    render(<IncidentDetail id={4} user={USERS.employee} />);

    await user.click(await screen.findByRole('button', { name: /Escalate \/ request/ }));
    expect(screen.queryByRole('option', { name: 'Request Low' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escalate' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Why is this urgent?'), 'Board meeting');
    await user.selectOptions(screen.getByRole('combobox'), 'Request Critical');
    await user.click(screen.getByRole('button', { name: 'Escalate' }));

    expect(api.calls.at(-1).body).toEqual({ reason: 'Board meeting', requested_priority: 'critical' });
    expect(await screen.findByText('Escalation reason')).toBeInTheDocument();
    expect(screen.getByText('→ Critical requested')).toBeInTheDocument();
  });

  it('admin assigns an engineer and approves a priority request', async () => {
    const user = userEvent.setup();
    const perms = { can_assign: true, can_set_priority: true };
    const api = setup(incident({ assigned_engineer_id: null, assigned_engineer: null, status: 'open', is_escalated: true,
                                 requested_priority: 'high', permissions: perms }), {
      'POST /incidents/4/assign': incident({ status: 'assigned', assigned_engineer: 'Tom Tech', assigned_engineer_id: 4,
                                             is_escalated: true, requested_priority: 'high', permissions: perms }),
      'PATCH /incidents/4': (body) => incident({ ...body, status: 'assigned', permissions: perms }),
    });
    render(<IncidentDetail id={4} user={USERS.admin} />);

    expect(await screen.findByText(/Employee requested/)).toHaveTextContent('Employee requested High.');
    const assignBlock = screen.getByRole('heading', { name: 'Assign engineer' }).closest('.action-block');
    await within(assignBlock).findByRole('option', { name: /Tom Tech/ });
    await user.selectOptions(within(assignBlock).getByRole('combobox'), '4');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    expect(api.calls.find((c) => c.path === '/incidents/4/assign').body).toEqual({ engineer_id: 4 });
    expect(await screen.findAllByText('Tom Tech')).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Set priority' }));
    expect(api.calls.at(-1).body).toEqual({ priority: 'high' });
  });

  it('edits details in place', async () => {
    const user = userEvent.setup();
    const api = setup(incident({ status: 'open', permissions: { can_edit: true } }), {
      'GET /facilities': [],
      'PATCH /incidents/4': (body) => incident({ ...body, status: 'open', permissions: { can_edit: true } }),
    });
    render(<IncidentDetail id={4} user={USERS.employee} />);

    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const title = screen.getByLabelText(/^Title/);
    await user.clear(title);
    await user.type(title, 'AC broken');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { name: 'AC broken' })).toBeInTheDocument();
    expect(api.calls.at(-1).body).not.toHaveProperty('priority');
  });

  it('deletes after confirmation and returns to the list', async () => {
    const user = userEvent.setup();
    setup(incident({ permissions: { can_delete: true } }), { 'DELETE /incidents/4': { status: 204, body: null } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<IncidentDetail id={4} user={USERS.admin} />);

    await user.click(await screen.findByRole('button', { name: 'Delete incident' }));
    await vi.waitFor(() => expect(window.location.hash).toBe('#/incidents'));
  });

  it('shows action errors from the server', async () => {
    const user = userEvent.setup();
    setup(incident({ permissions: { status_transitions: ['resolved'] } }), {
      'POST /incidents/4/status': { status: 403, body: { message: "You can't change this incident from closed to resolved." } },
    });
    render(<IncidentDetail id={4} user={USERS.engineer} />);
    await user.click(await screen.findByRole('button', { name: 'Mark resolved' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't change this incident");
  });

  it('shows a not-found message', async () => {
    mockApi({ 'GET /incidents/99': { status: 404, body: { message: 'Incident not found.' } } });
    render(<IncidentDetail id={99} user={USERS.employee} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Incident not found.');
  });

  it('says when notes are closed', async () => {
    setup(incident({ status: 'closed' }));
    render(<IncidentDetail id={4} user={USERS.employee} />);
    expect(await screen.findByText('Notes are closed for this incident.')).toBeInTheDocument();
    expect(screen.getByText('No notes yet.')).toBeInTheDocument();
  });
});

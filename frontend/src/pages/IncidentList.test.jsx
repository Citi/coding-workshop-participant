import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { USERS, mockApi } from '../test/mockApi';
import IncidentList from './IncidentList';

const row = (id) => ({
  id, reference: `INC-${String(id).padStart(6, '0')}`, title: `Incident ${id}`, category: 'other', priority: 'low',
  status: 'open', requested_priority: null, is_escalated: false, updated_at: new Date().toISOString(),
  building: 'HQ', floor: null, seat: null, location_details: null, reported_by: 'Emma Employee', assigned_engineer: null,
});

describe('IncidentList', () => {
  it('sends filters to the API and shows results', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'GET /incidents': { items: [row(1)], total: 1 } });
    render(<IncidentList user={USERS.admin} />);

    expect(await screen.findByRole('heading', { name: '1 incident' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All incidents' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'On hold');
    await user.selectOptions(screen.getByLabelText('Priority'), 'High');
    await user.click(screen.getByLabelText('Escalated'));
    await user.click(screen.getByLabelText('Unassigned'));
    await user.type(screen.getByLabelText('Search incidents'), 'wifi');

    await waitFor(() => expect(api.calls.at(-1).query.get('q')).toBe('wifi'));
    const q = api.calls.at(-1).query;
    expect(Object.fromEntries(q)).toMatchObject({ status: 'on_hold', priority: 'high', escalated: 'true', unassigned: 'true', offset: '0' });
  });

  it('employees get their own heading and no unassigned filter', async () => {
    mockApi({ 'GET /incidents': { items: [], total: 0 } });
    render(<IncidentList user={USERS.employee} />);
    expect(await screen.findByText('No incidents match these filters.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My incidents' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Unassigned')).not.toBeInTheDocument();
  });

  it('pages through results', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'GET /incidents': { items: [row(1)], total: 30 } });
    render(<IncidentList user={USERS.engineer} />);

    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(api.calls.at(-1).query.get('offset')).toBe('25');
  });

  it('shows API errors', async () => {
    mockApi({ 'GET /incidents': { status: 500, body: { message: 'Something went wrong. Please try again.' } } });
    render(<IncidentList user={USERS.employee} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

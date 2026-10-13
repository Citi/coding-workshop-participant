import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArchivePage from '../pages/ArchivePage';
import PeoplePage from '../pages/PeoplePage';
import TimePage from '../pages/TimePage';
import {
  mockApi, renderWithProviders, signInAs, users,
} from '../test/utils';
import { employees, entries, project } from '../test/fixtures';

describe('PeoplePage', () => {
  it('lets managers edit only their own team', async () => {
    signInAs(users.manager);
    const spy = mockApi(vi, {
      'GET /auth/me': users.manager,
      'GET /users': employees,
      'PUT /users/4': (url, init) => [200, { ...employees[0], ...JSON.parse(init.body) }],
    });
    renderWithProviders(<PeoplePage />, { route: '/people' });
    expect(await screen.findByText('Sam Okafor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Aisha Patel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Sam Okafor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archive/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Aisha Patel' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/Role/)).not.toBeInTheDocument();
    const name = within(dialog).getByLabelText(/Full name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Aisha P.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      const put = spy.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(JSON.parse(put[1].body)).toEqual({ name: 'Aisha P.', email: 'a@x.com' });
    });
  });

  it('lets admins add a person with validation', async () => {
    signInAs(users.admin);
    mockApi(vi, { 'GET /auth/me': users.admin, 'GET /users': employees });
    renderWithProviders(<PeoplePage />, { route: '/people' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add person' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'bad');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add person' }));
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(within(dialog).getByText('Password is required.')).toBeInTheDocument();
  });

  it('opens a person profile', async () => {
    signInAs(users.admin);
    mockApi(vi, {
      'GET /auth/me': users.admin,
      'GET /users': employees,
      'GET /users/6': { ...employees[2], projects: [{ id: 7, name: 'Portal', status: 'active', hours: 8 }] },
    });
    renderWithProviders(<PeoplePage />, { route: '/people' });
    await userEvent.click(await screen.findByText('Sam Okafor'));
    expect(await screen.findByText('Reports to David Chen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Portal' })).toBeInTheDocument();
  });
});

describe('TimePage', () => {
  it('shows totals and archives an entry after confirmation', async () => {
    signInAs(users.employee);
    const spy = mockApi(vi, {
      'GET /auth/me': users.employee,
      'GET /time-entries': entries,
      'GET /projects': [{ ...project, can_manage: false }],
      'DELETE /time-entries/21': () => [204, undefined],
    });
    renderWithProviders(<TimePage />, { route: '/time' });
    expect(await screen.findByText('Built login')).toBeInTheDocument();
    expect(screen.getByText('Total for this period')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Archive 8 h/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive entry' }));
    expect(await screen.findByText('Time entry archived.')).toBeInTheDocument();
    expect(spy.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });
});

describe('ArchivePage', () => {
  it('restores an archived project', async () => {
    signInAs(users.admin);
    let restored = false;
    mockApi(vi, {
      'GET /auth/me': users.admin,
      'GET /archive': () => [200, {
        projects: restored ? [] : [{
          id: 9, name: 'Old Site', manager_name: 'Maria Lopez', start_date: '2025-01-01', estimated_end_date: '2025-06-01',
          budget: 1000, total_hours: 10, archived_at: '2026-07-01T00:00:00Z', archived_by_name: 'Alex Morgan',
        }],
        milestones: [],
        users: [],
        time_entries: [],
      }],
      'POST /archive/projects/9/restore': () => { restored = true; return [200, { message: 'Restored.' }]; },
    });
    renderWithProviders(<ArchivePage />, { route: '/archive' });
    expect(await screen.findByText('Old Site')).toBeInTheDocument();
    expect(screen.getByText('by Alex Morgan')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText('Restored Old Site.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /People/ }));
    expect(await screen.findByText('No archived people')).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import ProjectFormDialog from '../components/forms/ProjectFormDialog';
import {
  mockApi, renderWithProviders, signInAs, users,
} from '../test/utils';

const dashboard = {
  stats: {
    projects_total: 1, projects_active: 1, projects_completed: 0, projects_overdue: 0, milestones_overdue: 0,
    hours_this_week: 16, hours_total: 80, days_total: 10, budget_total: 1000, capacity_this_week: 16,
  },
  projects: [{
    id: 7, name: 'Portal', status: 'active', is_overdue: false, estimated_end_date: '2026-12-01',
    milestones_completed: 1, milestone_count: 2, manager_name: 'Maria Lopez', total_hours: 80, planned_hours: 400,
  }],
  upcoming_milestones: [],
  weekly_hours: [{ week: '2026-10-05', hours: 40 }],
};

describe('Login', () => {
  it('validates before submitting', async () => {
    const fetchSpy = mockApi(vi, {});
    renderWithProviders(<App />, { route: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your username or email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the server message on bad credentials', async () => {
    mockApi(vi, { 'POST /auth/login': () => [401, { error: { message: 'Incorrect username or password.' } }] });
    renderWithProviders(<App />, { route: '/login' });
    await userEvent.type(screen.getByLabelText('Username or email'), 'admin');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect username or password.')).toBeInTheDocument();
  });

  it('signs in and lands on the overview', async () => {
    mockApi(vi, {
      'POST /auth/login': { access_token: 'a', refresh_token: 'r', user: users.employee },
      'GET /auth/me': users.employee,
      'GET /dashboard': dashboard,
    });
    renderWithProviders(<App />, { route: '/login' });
    await userEvent.type(screen.getByLabelText('Username or email'), 'apatel');
    await userEvent.type(screen.getByLabelText('Password'), 'Employee123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Hello, Aisha' })).toBeInTheDocument();
    expect(screen.getByText('Your week')).toBeInTheDocument();
  });
});

describe('Role-based navigation', () => {
  it('redirects anonymous users to sign in', () => {
    mockApi(vi, {});
    renderWithProviders(<App />, { route: '/projects' });
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('hides admin-only areas from employees', async () => {
    signInAs(users.employee);
    mockApi(vi, { 'GET /auth/me': users.employee, 'GET /dashboard': dashboard });
    renderWithProviders(<App />, { route: '/archive' });
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('Archive')).not.toBeInTheDocument();
    expect(within(nav).queryByText(/People/)).not.toBeInTheDocument();
  });

  it('shows admins every area and their headline numbers', async () => {
    signInAs(users.admin);
    mockApi(vi, {
      'GET /auth/me': users.admin,
      'GET /dashboard': { ...dashboard, stats: { ...dashboard.stats, employees: 4, managers: 2 } },
    });
    renderWithProviders(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Archive')).toBeInTheDocument();
    expect(await screen.findByText('2 managers, 4 employees')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Portal' })).toHaveAttribute('href', '/projects/7');
  });
});

describe('ProjectFormDialog', () => {
  const managers = [{ id: 2, name: 'Maria Lopez' }];

  it('lets admins pick a manager and validates dates', async () => {
    signInAs(users.admin);
    const fetchSpy = mockApi(vi, { 'GET /auth/me': users.admin });
    renderWithProviders(<ProjectFormDialog open managers={managers} onClose={() => {}} onSaved={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Project name/), 'New thing');
    const end = screen.getByLabelText(/Estimated end date/);
    await userEvent.type(end, '2000-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByText('Manager is required.')).toBeInTheDocument();
    expect(screen.getByText(/must be on or after the start date/)).toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('hides the manager field from managers and saves changes', async () => {
    signInAs(users.manager);
    const onSaved = vi.fn();
    const fetchSpy = mockApi(vi, {
      'GET /auth/me': users.manager,
      'PUT /projects/7': (url, init) => [200, { id: 7, ...JSON.parse(init.body) }],
    });
    const project = {
      id: 7, name: 'Portal', description: '', manager_id: 2, start_date: '2026-01-01',
      estimated_end_date: '2026-06-30', budget: 5000, status: 'active',
    };
    renderWithProviders(<ProjectFormDialog open project={project} onClose={() => {}} onSaved={onSaved} />);
    expect(screen.queryByLabelText(/Project manager/)).not.toBeInTheDocument();
    const budget = screen.getByLabelText(/Budget/);
    await userEvent.clear(budget);
    await userEvent.type(budget, '9000');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const put = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PUT');
    const body = JSON.parse(put[1].body);
    expect(body.budget).toBe(9000);
    expect(body).not.toHaveProperty('manager_id');
  });

  it('shows server field errors next to the field', async () => {
    signInAs(users.manager);
    mockApi(vi, {
      'GET /auth/me': users.manager,
      'PUT /projects/7': () => [400, { error: { message: 'Please correct the highlighted fields.', details: { budget: 'Budget cannot be below 90,000.00 already allocated to milestones.' } } }],
    });
    const project = {
      id: 7, name: 'Portal', description: '', manager_id: 2, start_date: '2026-01-01',
      estimated_end_date: '2026-06-30', budget: 100000, status: 'active',
    };
    renderWithProviders(<ProjectFormDialog open project={project} onClose={() => {}} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/already allocated to milestones/)).toBeInTheDocument();
  });
});

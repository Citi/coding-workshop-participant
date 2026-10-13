import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectDetailPage from '../pages/ProjectDetailPage';
import ProjectsPage from '../pages/ProjectsPage';
import {
  mockApi, renderWithProviders, signInAs, users,
} from '../test/utils';
import { employees, entries, project } from '../test/fixtures';

function renderDetail() {
  return renderWithProviders(
    <Routes><Route path="/projects/:id" element={<ProjectDetailPage />} /></Routes>,
    { route: '/projects/7' },
  );
}

describe('ProjectsPage', () => {
  it('lists projects with hours against plan and lets admins create one', async () => {
    signInAs(users.admin);
    mockApi(vi, {
      'GET /auth/me': users.admin,
      'GET /projects': [project],
      'GET /users': [{ id: 2, name: 'Maria Lopez' }],
    });
    renderWithProviders(<ProjectsPage />, { route: '/projects' });
    expect(await screen.findByRole('link', { name: 'Portal' })).toBeInTheDocument();
    expect(screen.getByText('48 h of 1,360 h')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  it('shows an empty state with no projects', async () => {
    signInAs(users.employee);
    mockApi(vi, { 'GET /auth/me': users.employee, 'GET /projects': [] });
    renderWithProviders(<ProjectsPage />, { route: '/projects' });
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
  });
});

describe('ProjectDetailPage (manager)', () => {
  const routes = () => ({
    'GET /auth/me': users.manager,
    'GET /projects/7': project,
    'GET /projects/7/time-entries': entries,
    'GET /users': employees,
  });

  it('shows facts, milestones and capacity', async () => {
    signInAs(users.manager);
    mockApi(vi, routes());
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Portal' })).toBeInTheDocument();
    expect(screen.getByText('$60,000 allocated to milestones')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /48 h logged of 1,360 h/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'MVP' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('marks people from other teams and adds the rest of the team', async () => {
    signInAs(users.manager);
    const spy = mockApi(vi, { ...routes(), 'POST /projects/7/members': () => [201, project.members] });
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: /Team/ }));
    expect(screen.getByText("On loan from David Chen's team")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Add people' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Jordan Smith')).toBeInTheDocument();
    expect(within(dialog).queryByText('Aisha Patel')).not.toBeInTheDocument(); // already assigned
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Lena Novak' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 1 person' }));
    await waitFor(() => {
      const post = spy.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(JSON.parse(post[1].body)).toEqual({ user_ids: [8] });
    });
  });

  it('completes a milestone from its menu', async () => {
    signInAs(users.manager);
    const spy = mockApi(vi, { ...routes(), 'PUT /milestones/11': () => [200, { ...project.milestones[0], status: 'completed' }] });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for MVP' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark as completed' }));
    expect(await screen.findByText('MVP marked as completed.')).toBeInTheDocument();
    const put = spy.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({ status: 'completed' });
  });

  it('opens the milestone form with remaining budget', async () => {
    signInAs(users.manager);
    mockApi(vi, routes());
    renderDetail();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Add milestone' }))[0]);
    expect(await screen.findByText('$40,000 of the project budget is available.')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'New milestone' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('End date is required.')).toBeInTheDocument();
  });

  it('lists time entries with totals', async () => {
    signInAs(users.manager);
    mockApi(vi, routes());
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Time log' }));
    expect(await screen.findByText('Built login')).toBeInTheDocument();
    expect(screen.getByText(/8 h in total \(1 day\)/)).toBeInTheDocument();
  });

  it('reports a missing project', async () => {
    signInAs(users.manager);
    mockApi(vi, { 'GET /auth/me': users.manager, 'GET /projects/7': () => [404, { error: { message: 'Project not found.' } }] });
    renderDetail();
    expect(await screen.findByText('Project not found.')).toBeInTheDocument();
  });
});

describe('ProjectDetailPage (employee)', () => {
  it('lets employees log time but not manage', async () => {
    signInAs(users.employee);
    const readOnly = { ...project, can_manage: false };
    const spy = mockApi(vi, {
      'GET /auth/me': users.employee,
      'GET /projects/7': readOnly,
      'GET /projects/7/time-entries': entries,
      'POST /time-entries': (url, init) => [201, { id: 99, ...JSON.parse(init.body) }],
    });
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Portal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit project' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log time' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log time' });
    expect(within(dialog).queryByLabelText('Person')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('What did you work on?'), 'Testing');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log time' }));
    expect(await screen.findByText('Time logged.')).toBeInTheDocument();
    const post = spy.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ project_id: 7, user_id: 4, hours: 8, note: 'Testing' });
  });
});

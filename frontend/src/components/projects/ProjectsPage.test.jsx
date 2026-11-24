import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { ALPHA, DEPARTMENTS, PROJECTS, USERS } from './testFixtures.js';
import ProjectsPage from '../../pages/ProjectsPage.jsx';
import { ApiError } from '../../services/apiClient.js';
import { listDepartments } from '../../services/departments.js';
import { createProject, deleteProject, listProjects, updateProject } from '../../services/projects.js';
import { listUsers } from '../../services/users.js';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';

vi.mock('../../services/projects.js');
vi.mock('../../services/departments.js');
vi.mock('../../services/users.js');

// Every service is mocked: fail loudly if anything still reaches the network.
const unexpectedFetch = vi.fn(() => new Promise(() => {}));
beforeAll(() => vi.stubGlobal('fetch', unexpectedFetch));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => expect(unexpectedFetch).not.toHaveBeenCalled());


function renderPage(role, { route = '/projects', width } = {}) {
  return renderWithProviders(
    <Routes>
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<p>Project detail page</p>} />
    </Routes>,
    { route, width, auth: makeAuthValue({ user: makeUser(role) }) },
  );
}

const lastListParams = () => vi.mocked(listProjects).mock.lastCall[0];

async function choose(user, combobox, option) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

async function openCreateDialog(user) {
  await user.click(await screen.findByRole('button', { name: 'New project' }));
  return screen.findByRole('dialog', { name: 'New project' });
}

async function fillValidProject(user, dialog) {
  await user.type(within(dialog).getByLabelText(/^Project name/), 'Project Zeta: Data Platform');
  await choose(user, within(dialog).getByRole('combobox', { name: /^Department/ }), 'Finance');
  await choose(user, within(dialog).getByRole('combobox', { name: 'Project manager' }), 'Kabir Sethi (Manager)');
  fireEvent.change(within(dialog).getByLabelText(/^Start date/), { target: { value: '2026-12-01' } });
  fireEvent.change(within(dialog).getByLabelText(/^End date/), { target: { value: '2027-03-31' } });
  await user.type(within(dialog).getByLabelText(/^Planned budget/), '150,000.5');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listProjects).mockResolvedValue({ items: PROJECTS, total: PROJECTS.length });
  vi.mocked(listDepartments).mockResolvedValue({ items: DEPARTMENTS, total: DEPARTMENTS.length });
  vi.mocked(listUsers).mockResolvedValue({ items: USERS, total: USERS.length });
});

describe('ProjectsPage permissions', () => {
  it.each(['VIEWER', 'LEAD'])('shows %s the projects without create, edit or delete', async (role) => {
    renderPage(role);

    expect(await screen.findByRole('link', { name: ALPHA.project_name })).toHaveAttribute('href', '/projects/1');
    expect(screen.getAllByRole('row')).toHaveLength(PROJECTS.length + 1);
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it.each(['PM', 'ADMIN'])('gives %s create, edit and delete', async (role) => {
    renderPage(role);

    expect(await screen.findByRole('button', { name: `Edit ${ALPHA.project_name}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete ${ALPHA.project_name}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
  });

  it('shows the project facts in each row', async () => {
    renderPage('VIEWER');

    const row = (await screen.findByRole('link', { name: ALPHA.project_name })).closest('tr');
    expect(within(row).getByText('Engineering')).toBeInTheDocument();
    expect(within(row).getByText('Vikram Shah')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(within(row).getByText('35.0%')).toBeInTheDocument();
    expect(within(row).getByText('75.0%')).toBeInTheDocument();
    expect(within(row).getByText('Critical · 78')).toBeInTheDocument();
    expect(within(row).getByText('Dec 19, 2026')).toBeInTheDocument();
  });

  it('renders stacked cards on a phone, still without actions for VIEWER', async () => {
    renderPage('VIEWER', { width: PHONE_WIDTH });

    const list = await screen.findByRole('list', { name: 'Projects' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(PROJECTS.length);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
  });
});

describe('ProjectsPage filters', () => {
  it('maps search, department, status and risk level to the API query', async () => {
    const { user } = renderPage('VIEWER');
    await screen.findByRole('link', { name: ALPHA.project_name });
    expect(lastListParams()).toEqual({ limit: 25, offset: 0 });

    await choose(user, screen.getByRole('combobox', { name: 'Department' }), 'Engineering');
    await waitFor(() => expect(lastListParams()).toMatchObject({ department_id: '1' }));
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'Active');
    await waitFor(() => expect(lastListParams()).toMatchObject({ department_id: '1', status: 'ACTIVE' }));
    await choose(user, screen.getByRole('combobox', { name: 'Risk level' }), 'Critical');
    await waitFor(() => expect(lastListParams()).toMatchObject({ status: 'ACTIVE', risk_level: 'CRITICAL' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'alpha');
    await waitFor(() =>
      expect(lastListParams()).toEqual({
        q: 'alpha',
        department_id: '1',
        status: 'ACTIVE',
        risk_level: 'CRITICAL',
        limit: 25,
        offset: 0,
      }),
    );
    expect(vi.mocked(listProjects).mock.calls.some(([params]) => params.q === 'a')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastListParams()).toEqual({ limit: 25, offset: 0 }));
  });

  it('starts from filters in the URL, as the dashboard links them', async () => {
    renderPage('VIEWER', { route: '/projects?risk_level=HIGH&status=ACTIVE&department_id=4' });

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({ risk_level: 'HIGH', status: 'ACTIVE', department_id: '4' }),
    );
    expect(await screen.findByRole('combobox', { name: 'Risk level' })).toHaveTextContent('High');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Department' })).toHaveTextContent('Operations'));
  });

  it('ignores unknown filter values in the URL', async () => {
    renderPage('VIEWER', { route: '/projects?risk_level=SEVERE&status=nope&department_id=abc' });

    await screen.findByRole('link', { name: ALPHA.project_name });
    expect(lastListParams()).toEqual({ limit: 25, offset: 0 });
  });

  it('explains an empty result and offers to clear the filters', async () => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], total: 0 });
    const { user } = renderPage('PM', { route: '/projects?status=CANCELLED' });

    expect(await screen.findByText('No projects match these filters')).toBeInTheDocument();
    await user.click(within(screen.getByText('No projects match these filters').parentElement).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastListParams()).toEqual({ limit: 25, offset: 0 }));
  });

  it('shows an error with a retry button when the list fails', async () => {
    vi.mocked(listProjects)
      .mockRejectedValueOnce(new ApiError({ status: 500, error: 'INTERNAL_ERROR', message: 'Database is resuming.' }))
      .mockResolvedValue({ items: PROJECTS, total: PROJECTS.length });
    const { user } = renderPage('VIEWER');

    expect(await screen.findByText('Database is resuming.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: ALPHA.project_name })).toBeInTheDocument();
  });
});

describe('ProjectsPage create and edit dialog', () => {
  it('validates before submitting and keeps the API untouched', async () => {
    const { user } = renderPage('PM');
    const dialog = await openCreateDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(within(dialog).getByText('Enter a project name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a department.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a start date.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose an end date.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Enter the planned budget/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Project name/)).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText(/^Project name/)).toHaveFocus();
    expect(createProject).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/^Start date/), { target: { value: '2026-12-01' } });
    fireEvent.change(within(dialog).getByLabelText(/^End date/), { target: { value: '2026-11-01' } });
    await user.type(within(dialog).getByLabelText(/^Planned budget/), '10.555');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(within(dialog).getByText('The end date must be on or after the start date.')).toBeInTheDocument();
    expect(within(dialog).getByText('Planned budget can have at most 2 decimal places.')).toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('places the API field errors next to the fields and keeps the dialog open', async () => {
    vi.mocked(createProject).mockRejectedValue(
      new ApiError({
        status: 400,
        error: 'VALIDATION_ERROR',
        message: 'The end date must be on or after the start date.',
        details: [{ field: 'end_date', issue: 'end_date (2027-03-31) must be on or after start_date (2027-04-01).' }],
      }),
    );
    const { user } = renderPage('PM');
    const dialog = await openCreateDialog(user);
    await fillValidProject(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    const endDate = within(dialog).getByLabelText(/^End date/);
    expect(await within(dialog).findByText(/must be on or after start_date \(2027-04-01\)/)).toBeInTheDocument();
    expect(endDate).toHaveAttribute('aria-invalid', 'true');
    expect(endDate).toHaveAccessibleDescription(/must be on or after start_date/);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The end date must be on or after the start date.');
    expect(await screen.findByText('The project was not created.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create project' })).toBeEnabled();
  });

  it('disables the form while saving, then creates the project and reloads the list', async () => {
    let resolveCreate;
    vi.mocked(createProject).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { user } = renderPage('PM');
    const dialog = await openCreateDialog(user);
    await fillValidProject(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByLabelText(/^Project name/)).toBeDisabled();
    expect(createProject).toHaveBeenCalledWith({
      project_name: 'Project Zeta: Data Platform',
      department_id: 3,
      project_manager_id: 8,
      status: 'PLANNED',
      start_date: '2026-12-01',
      end_date: '2027-03-31',
      planned_budget: '150000.50',
      description: null,
    });

    resolveCreate({ ...ALPHA, id: 6, project_name: 'Project Zeta: Data Platform' });
    expect(await screen.findByText('Created Project Zeta: Data Platform.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New project' })).not.toBeInTheDocument());
    expect(listProjects).toHaveBeenCalledTimes(2);
  });

  it('edits a project and sends only the fields that changed', async () => {
    vi.mocked(updateProject).mockResolvedValue({ ...ALPHA, project_name: 'Project Alpha: Payments' });
    const { user } = renderPage('PM');
    await user.click(await screen.findByRole('button', { name: `Edit ${ALPHA.project_name}` }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${ALPHA.project_name}` });

    const name = within(dialog).getByLabelText(/^Project name/);
    expect(name).toHaveValue(ALPHA.project_name);
    expect(within(dialog).getByLabelText(/^Planned budget/)).toHaveValue('400000.00');
    await user.clear(name);
    await user.type(name, 'Project Alpha: Payments');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(updateProject).toHaveBeenCalledWith(1, { project_name: 'Project Alpha: Payments' });
    expect(await screen.findByText('Saved changes to Project Alpha: Payments.')).toBeInTheDocument();
  });

  it('closes without a request when nothing changed', async () => {
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: `Edit ${ALPHA.project_name}` }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${ALPHA.project_name}` });

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();
  });
});

describe('ProjectsPage delete', () => {
  it('asks for confirmation, deletes and reloads', async () => {
    vi.mocked(deleteProject).mockResolvedValue(null);
    const { user } = renderPage('PM');
    await user.click(await screen.findByRole('button', { name: `Delete ${ALPHA.project_name}` }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete project?' });
    expect(dialog).toHaveTextContent(`${ALPHA.project_name} and all of its deliverables`);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(deleteProject).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    expect(deleteProject).toHaveBeenCalledWith(1);
    expect(await screen.findByText(`Deleted ${ALPHA.project_name}.`)).toBeInTheDocument();
    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(2));
  });

  it('reports a failed delete', async () => {
    vi.mocked(deleteProject).mockRejectedValue(
      new ApiError({ status: 404, error: 'NOT_FOUND', message: 'Project 1 was not found.' }),
    );
    const { user } = renderPage('ADMIN');
    await user.click(await screen.findByRole('button', { name: `Delete ${ALPHA.project_name}` }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete project' }));

    expect(await screen.findByText('Project 1 was not found.')).toBeInTheDocument();
  });
});

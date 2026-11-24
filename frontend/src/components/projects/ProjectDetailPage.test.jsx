import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import {
  ALPHA,
  ALPHA_BUDGET_ENTRIES,
  ALPHA_DELIVERABLES,
  ALPHA_GRAPH,
  ALPHA_LINKS,
  ALPHA_RISK,
  DEPARTMENTS,
  PROJECTS,
  USERS,
} from './testFixtures.js';
import ProjectDetailPage from '../../pages/ProjectDetailPage.jsx';
import { ApiError } from '../../services/apiClient.js';
import { listBudgetEntries } from '../../services/budgetEntries.js';
import { listDeliverables } from '../../services/deliverables.js';
import { listDepartments } from '../../services/departments.js';
import { listDependencies } from '../../services/dependencies.js';
import {
  deleteProject,
  getProject,
  getProjectDependencyGraph,
  getProjectRisk,
  updateProject,
} from '../../services/projects.js';
import { listUsers } from '../../services/users.js';
import { makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';

vi.mock('../../services/projects.js');
vi.mock('../../services/deliverables.js');
vi.mock('../../services/dependencies.js');
vi.mock('../../services/budgetEntries.js');
vi.mock('../../services/departments.js');
vi.mock('../../services/users.js');

// Every service is mocked: fail loudly if anything still reaches the network.
const unexpectedFetch = vi.fn(() => new Promise(() => {}));
beforeAll(() => vi.stubGlobal('fetch', unexpectedFetch));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => expect(unexpectedFetch).not.toHaveBeenCalled());


const DELTA = PROJECTS.find((project) => project.id === 4);

/**
 * Prints the router location so tests can check the URL the page keeps.
 * @returns {JSX.Element} The current path and query string.
 */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

/** Takes no props. */
LocationProbe.propTypes = {};

function renderDetail(route, role = 'PM') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/projects/:id"
        element={
          <>
            <ProjectDetailPage />
            <LocationProbe />
          </>
        }
      />
      <Route path="/projects" element={<p>Projects list page</p>} />
    </Routes>,
    { route, auth: makeAuthValue({ user: makeUser(role) }) },
  );
}

const heading = () => screen.findByRole('heading', { level: 1, name: ALPHA.project_name });
const tab = (name) => screen.getByRole('tab', { name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getProject).mockImplementation(async (id) => PROJECTS.find((project) => String(project.id) === String(id)));
  vi.mocked(getProjectRisk).mockResolvedValue(ALPHA_RISK);
  vi.mocked(getProjectDependencyGraph).mockResolvedValue(ALPHA_GRAPH);
  vi.mocked(listDependencies).mockResolvedValue({ items: ALPHA_LINKS, total: ALPHA_LINKS.length });
  vi.mocked(listDeliverables).mockResolvedValue({ items: ALPHA_DELIVERABLES, total: ALPHA_DELIVERABLES.length });
  vi.mocked(listBudgetEntries).mockResolvedValue({ items: ALPHA_BUDGET_ENTRIES, total: ALPHA_BUDGET_ENTRIES.length });
  vi.mocked(listDepartments).mockResolvedValue({ items: DEPARTMENTS, total: DEPARTMENTS.length });
  vi.mocked(listUsers).mockResolvedValue({ items: USERS, total: USERS.length });
});

describe('ProjectDetailPage header', () => {
  it('shows the project name, its status and risk as text, and a way back to the list', async () => {
    renderDetail('/projects/1');

    expect(await heading()).toBeInTheDocument();
    expect(screen.getByText(/Engineering · Managed by Vikram Shah · Sep 25, 2026 to Dec 19, 2026/)).toBeInTheDocument();
    expect(screen.getAllByText('Critical · 78').length).toBeGreaterThan(0);
    expect(screen.getByText('35.0% complete · 75.0% of budget used')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(document.title).toBe(`${ALPHA.project_name} | ACME Project Intelligence`);
  });

  it('shows the loading header with the id, then the project', async () => {
    renderDetail('/projects/1');

    expect(screen.getByRole('heading', { level: 1, name: 'Project details' })).toBeInTheDocument();
    expect(screen.getByText('Project #1')).toBeInTheDocument();
    expect(await heading()).toBeInTheDocument();
  });

  it.each(['LEAD', 'VIEWER'])('hides edit and delete from %s', async (role) => {
    renderDetail('/projects/1', role);
    await heading();

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('lets PM delete the project after confirming, then returns to the list', async () => {
    vi.mocked(deleteProject).mockResolvedValue(null);
    const { user } = renderDetail('/projects/1', 'PM');
    await heading();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete project?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(deleteProject).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Projects list page')).toBeInTheDocument();
    expect(screen.getByText(`Deleted ${ALPHA.project_name}.`)).toBeInTheDocument();
  });

  it('saves an edit, reloads the project and reports a failed refresh', async () => {
    vi.mocked(updateProject).mockResolvedValue({ ...ALPHA, status: 'ON_HOLD' });
    const { user } = renderDetail('/projects/1', 'PM');
    await heading();
    vi.mocked(getProject).mockRejectedValue(
      new ApiError({ status: 503, error: 'INTERNAL_ERROR', message: 'Service unavailable.' }),
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${ALPHA.project_name}` });
    await user.click(within(dialog).getByRole('combobox', { name: /^Status/ }));
    await user.click(await screen.findByRole('option', { name: 'On hold' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(updateProject).toHaveBeenCalledWith(1, { status: 'ON_HOLD' });
    expect(await screen.findByText(`Saved changes to ${ALPHA.project_name}.`)).toBeInTheDocument();
    expect(await screen.findByText('Could not refresh this project')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: ALPHA.project_name })).toBeInTheDocument();
    expect(getProject).toHaveBeenCalledTimes(2);
  });

  it('recalculates the Risk tab after the project is edited from the header', async () => {
    const edited = { ...ALPHA, end_date: '2027-03-31', risk_score: 58, risk_level: 'HIGH' };
    vi.mocked(getProjectRisk)
      .mockResolvedValueOnce(ALPHA_RISK)
      .mockResolvedValue({ ...ALPHA_RISK, risk_score: 58, risk_level: 'HIGH' });
    vi.mocked(updateProject).mockResolvedValue(edited);
    const { user } = renderDetail('/projects/1?tab=risk', 'PM');
    expect(await screen.findByTestId('risk-score')).toHaveTextContent('78');
    vi.mocked(getProject).mockResolvedValue(edited);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${ALPHA.project_name}` });
    fireEvent.change(within(dialog).getByLabelText(/^End date/), { target: { value: '2027-03-31' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(updateProject).toHaveBeenCalledWith(1, { end_date: '2027-03-31' });
    await waitFor(() => expect(screen.getByTestId('risk-score')).toHaveTextContent('58'));
    expect(within(screen.getByRole('region', { name: 'Risk score' })).getByText('High')).toBeInTheDocument();
    expect(screen.getByText('High · 58')).toBeInTheDocument();
    expect(getProjectRisk).toHaveBeenCalledTimes(2);
    expect(getProject).toHaveBeenCalledTimes(2);
  });

  it('opens the edit dialog with the project filled in', async () => {
    const { user } = renderDetail('/projects/1', 'ADMIN');
    await heading();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${ALPHA.project_name}` });
    expect(within(dialog).getByLabelText(/^Project name/)).toHaveValue(ALPHA.project_name);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('ProjectDetailPage tabs', () => {
  it('opens the tab named in ?tab= and keeps the URL in step with the selected tab', async () => {
    const { user } = renderDetail('/projects/1?tab=risk');
    await heading();

    expect(tab('Risk')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('risk-score')).toHaveTextContent('78');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('Risk').id);

    await user.click(tab('Deliverables'));
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/1?tab=deliverables');
    expect(await screen.findByRole('table', { name: 'Deliverables' })).toBeInTheDocument();

    await user.click(tab('Dependencies'));
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/1?tab=dependencies');
    expect(await screen.findAllByTestId('dependency-level')).toHaveLength(4);

    await user.click(tab('Budget'));
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/1?tab=budget');
    expect(await screen.findByRole('table', { name: 'Budget entries' })).toBeInTheDocument();

    await user.click(tab('Overview'));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/projects\/1$/);
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to Overview for a missing or unknown tab', async () => {
    renderDetail('/projects/1?tab=gantt');
    await heading();

    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
  });

  it('states on the Overview how far spending runs ahead of delivery', async () => {
    renderDetail('/projects/1');
    await heading();

    expect(screen.getByText('Spending is 40.0 points ahead of delivery')).toBeInTheDocument();
    expect(
      screen.getByText('75.0% of the planned budget is consumed and deliverables are 35.0% complete.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Budget consumed 75.0%; completion 35.0%.' })).toBeInTheDocument();
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('$400,000.00')).toBeInTheDocument();
    expect(within(details).getByText('$300,000.00')).toBeInTheDocument();
    expect(within(details).getByText('$100,000.00')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'See why' })).toHaveAttribute('href', '/projects/1?tab=risk');
  });

  it('flags overspend on the Overview of a project past its budget', async () => {
    renderDetail('/projects/4');
    await screen.findByRole('heading', { level: 1, name: DELTA.project_name });

    expect(screen.getByText('Spending is 50.0 points ahead of delivery')).toBeInTheDocument();
    expect(screen.getByText(/Spending has passed the planned budget\./)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Details' })).getByText('-$10,000.00')).toBeInTheDocument();
  });
});

describe('ProjectDetailPage errors', () => {
  it('shows not found for a project that does not exist', async () => {
    vi.mocked(getProject).mockRejectedValue(
      new ApiError({ status: 404, error: 'NOT_FOUND', message: 'Project 999999 was not found.' }),
    );
    renderDetail('/projects/999999');

    expect(await screen.findByText('Project 999999 was not found.')).toBeInTheDocument();
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/projects');
  });

  it('does not call the API for an id that is not a number', async () => {
    renderDetail('/projects/abc');

    expect(await screen.findByText('There is no project at this address.')).toBeInTheDocument();
    expect(getProject).not.toHaveBeenCalled();
  });

  it('offers a retry after a server error', async () => {
    vi.mocked(getProject)
      .mockRejectedValueOnce(new ApiError({ status: 503, error: 'INTERNAL_ERROR', message: 'Service unavailable.' }))
      .mockResolvedValueOnce(ALPHA);
    const { user } = renderDetail('/projects/1');

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await heading()).toBeInTheDocument();
  });
});

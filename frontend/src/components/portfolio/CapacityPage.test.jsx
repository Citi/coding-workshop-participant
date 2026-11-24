import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import CapacityPage from '../../pages/CapacityPage.jsx';
import { createAllocation, deleteAllocation, listAllocations, updateAllocation } from '../../services/allocations.js';
import { getCapacity } from '../../services/analytics.js';
import { listDeliverables } from '../../services/deliverables.js';
import { listDepartments } from '../../services/departments.js';
import { listProjects } from '../../services/projects.js';
import { listUsers } from '../../services/users.js';
import { ApiError } from '../../services/apiClient.js';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';
import ConflictSummary from './ConflictSummary.jsx';
import { ALLOCATIONS, CAPACITY, DELIVERABLES, DEPARTMENTS, PROJECTS, USERS } from './testFixtures.js';

vi.mock('../../services/analytics.js', () => ({ getCapacity: vi.fn() }));
vi.mock('../../services/allocations.js', () => ({
  listAllocations: vi.fn(),
  createAllocation: vi.fn(),
  updateAllocation: vi.fn(),
  deleteAllocation: vi.fn(),
}));
vi.mock('../../services/deliverables.js', () => ({ listDeliverables: vi.fn() }));
vi.mock('../../services/departments.js', () => ({ listDepartments: vi.fn() }));
vi.mock('../../services/projects.js', () => ({ listProjects: vi.fn() }));
vi.mock('../../services/users.js', () => ({ listUsers: vi.fn() }));

const WARNING = {
  user_id: 5,
  user_name: 'Priya Nair',
  peak_load: 170,
  windows: [
    { start_date: '2026-11-24', end_date: '2026-12-06', load: 170 },
    { start_date: '2026-12-07', end_date: '2026-12-10', load: 110 },
  ],
  message:
    'Saved, but Priya Nair is now allocated above 100%: 170% from 2026-11-24 to 2026-12-06 and 110% from 2026-12-07 to 2026-12-10.',
};

function renderPage(role = 'PM', options = {}) {
  return renderWithProviders(<CapacityPage />, {
    route: '/capacity',
    auth: makeAuthValue({ user: makeUser(role) }),
    ...options,
  });
}

async function choose(user, comboboxName, optionName, container = document.body) {
  await user.click(within(container).getByRole('combobox', { name: comboboxName }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

beforeEach(() => {
  getCapacity.mockResolvedValue(CAPACITY);
  listAllocations.mockResolvedValue(ALLOCATIONS);
  listDeliverables.mockResolvedValue(DELIVERABLES);
  listDepartments.mockResolvedValue(DEPARTMENTS);
  listProjects.mockResolvedValue(PROJECTS);
  listUsers.mockResolvedValue(USERS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CapacityPage people and load', () => {
  it('lists over-allocated people first with status, loads and bottleneck flag as text', async () => {
    renderPage('VIEWER');

    const table = await screen.findByRole('table', { name: 'Capacity by person' });
    const rows = within(table).getAllByRole('row');
    // Header, then Priya (over-allocated) before Arjun, each with a collapsed detail row.
    expect(rows[1]).toHaveTextContent('Priya Nair');
    expect(rows[3]).toHaveTextContent('Arjun Mehta');
    expect(within(rows[1]).getByText('Over-allocated')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('120%');
    expect(within(rows[1]).getByText('Compound bottleneck')).toBeInTheDocument();
    expect(within(rows[1]).getByText('API Schema')).toBeInTheDocument();
    // The window's load and dates are readable without opening the row.
    expect(within(rows[1]).getByText('120%: Nov 22 – Dec 6, 2026')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Available')).toBeInTheDocument();
    expect(within(rows[3]).getByText('None')).toBeInTheDocument();

    expect(screen.getByText('Over-allocated', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Highest peak load').parentElement).toHaveTextContent('120%');
    expect(getCapacity).toHaveBeenCalledWith({}, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('opens a person to show each conflict window with the allocations behind it', async () => {
    const { user } = renderPage('VIEWER');
    const toggle = await screen.findByRole('button', { name: 'Show conflict windows and load for Priya Nair' });
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('Hide conflict windows and load for Priya Nair');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const windows = await screen.findByRole('region', { name: 'Over-allocation windows for Priya Nair' });
    expect(windows).toHaveTextContent('120% allocated, Nov 22, 2026 to Dec 6, 2026');
    expect(windows).toHaveTextContent('20 percentage points over capacity');
    expect(windows).toHaveTextContent('Project Alpha: Customer Payments Platform · API Schema');
    expect(windows).toHaveTextContent('60% from Nov 14, 2026 to Dec 14, 2026');
    expect(windows).toHaveTextContent('Project Beta: Brand Relaunch Campaign · Project level');
    expect(screen.getByRole('region', { name: 'Load over time for Priya Nair' })).toHaveTextContent(
      'Nov 22, 2026 to Dec 6, 2026',
    );
    expect(screen.getByRole('link', { name: 'API Schema' })).toHaveAttribute('href', '/projects/1?tab=risk');
  });

  it('sends the department and date window to the API and refuses a reversed window', async () => {
    const { user } = renderPage('VIEWER');
    await screen.findByRole('table', { name: 'Capacity by person' });

    await choose(user, 'Department', 'Marketing');
    await waitFor(() => expect(getCapacity).toHaveBeenLastCalledWith({ department_id: 2 }, expect.anything()));

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-01' } });
    await waitFor(() =>
      expect(getCapacity).toHaveBeenLastCalledWith({ department_id: 2, from: '2026-12-01' }, expect.anything()),
    );

    const calls = getCapacity.mock.calls.length;
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
    expect(await screen.findByText('Must be on or after From.')).toBeInTheDocument();
    expect(getCapacity).toHaveBeenCalledTimes(calls);
    // The figures still on screen belong to the last valid period: said in words, and dimmed.
    expect(screen.getByRole('status')).toHaveTextContent('The figures below are for the last valid period.');
    expect(screen.getByTestId('capacity-kpis')).toHaveStyle({ opacity: '0.5' });

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    await waitFor(() => expect(getCapacity).toHaveBeenLastCalledWith({}, expect.anything()));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows cards with a details button on phones, named after its visible text', async () => {
    const { user } = renderPage('VIEWER', { width: PHONE_WIDTH });

    const list = await screen.findByRole('list', { name: 'Capacity by person' });
    const toggle = within(list).getByRole('button', { name: 'Show details: conflict windows and load for Priya Nair' });
    expect(toggle).toHaveTextContent('Show details');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(list).getByText('120%: Nov 22 – Dec 6, 2026')).toBeInTheDocument();
    expect(within(list).getByText('Compound bottleneck')).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Hide details');
    expect(toggle).toHaveAccessibleName('Hide details: conflict windows and load for Priya Nair');
    expect(await screen.findByRole('region', { name: 'Over-allocation windows for Priya Nair' })).toBeInTheDocument();
  });

  it('shows the error with a retry, and no tiles with zeros it never measured', async () => {
    getCapacity.mockRejectedValueOnce(new ApiError({ status: 503, error: 'INTERNAL_ERROR', message: 'Database resuming.' }));
    const { user } = renderPage('VIEWER');

    expect(await screen.findByText('Database resuming.')).toBeInTheDocument();
    expect(screen.queryByTestId('capacity-kpis')).not.toBeInTheDocument();
    expect(screen.queryByText('People allocated')).not.toBeInTheDocument();
    expect(screen.queryByText('No allocations')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table', { name: 'Capacity by person' })).toBeInTheDocument();
    expect(screen.getByText('People allocated').parentElement).toHaveTextContent('2');
  });

  it('shows dashes, not zeros, when the period is made invalid before anything has loaded', async () => {
    getCapacity.mockReturnValue(new Promise(() => {}));
    renderPage('VIEWER');
    await screen.findByTestId('capacity-kpis');

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
    expect(await screen.findByText('Must be on or after From.')).toBeInTheDocument();

    expect(screen.getByText('People allocated').parentElement).toHaveTextContent(/^People allocated—/);
    expect(screen.getByText('Over-allocated', { selector: 'p' }).parentElement).toHaveTextContent(/^Over-allocated—/);
    expect(screen.getByText('Compound bottlenecks').parentElement).toHaveTextContent(/^Compound bottlenecks—/);
    expect(screen.queryByText('No allocations')).not.toBeInTheDocument();
    expect(screen.getByText('Fix the period first')).toBeInTheDocument();
  });
});

describe('ConflictSummary', () => {
  it('writes out two windows with load and dates, and counts the rest', () => {
    renderWithProviders(
      <ConflictSummary
        conflicts={[
          { start_date: '2026-11-22', end_date: '2026-12-06', load: 120 },
          { start_date: '2026-12-10', end_date: '2026-12-10', load: 150 },
          { start_date: '2026-12-28', end_date: '2027-01-03', load: 110 },
        ]}
      />,
    );
    expect(screen.getByText('120%: Nov 22 – Dec 6, 2026')).toBeInTheDocument();
    expect(screen.getByText('150%: Dec 10, 2026')).toBeInTheDocument();
    expect(screen.queryByText(/110%/)).not.toBeInTheDocument();
    expect(screen.getByText('and 1 more window')).toBeInTheDocument();
  });

  it('says None when there is no window', () => {
    const { container } = renderWithProviders(<ConflictSummary conflicts={[]} />);
    expect(container).toHaveTextContent(/^None$/);
  });
});

describe('CapacityPage allocations', () => {
  it('hides allocation changes from roles that cannot make them', async () => {
    renderPage('LEAD');
    await screen.findByRole('table', { name: 'Allocations' });

    expect(screen.queryByRole('button', { name: 'New allocation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit allocation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete allocation/ })).not.toBeInTheDocument();
  });

  it('shows the capacity warning returned after saving an over-allocating allocation', async () => {
    createAllocation.mockResolvedValue({
      ...ALLOCATIONS.items[1],
      id: 9,
      allocation_percentage: 50,
      capacity_warning: WARNING,
    });
    const { user } = renderPage('PM');
    await user.click(await screen.findByRole('button', { name: 'New allocation' }));

    const dialog = screen.getByRole('dialog', { name: 'New allocation' });
    expect(within(dialog).getByLabelText(/^First day/)).toHaveValue('2026-11-24');
    await choose(user, /^Person/, 'Priya Nair', dialog);
    await choose(user, /^Project/, 'Project Beta: Brand Relaunch Campaign', dialog);
    await user.type(within(dialog).getByLabelText(/^Allocation/), '50');
    fireEvent.change(within(dialog).getByLabelText(/^Last day/), { target: { value: '2026-12-10' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }));

    await waitFor(() =>
      expect(createAllocation).toHaveBeenCalledWith({
        user_id: 5,
        project_id: 2,
        deliverable_id: null,
        allocation_percentage: 50,
        start_date: '2026-11-24',
        end_date: '2026-12-10',
      }),
    );
    const alert = await screen.findByTestId('capacity-warning');
    expect(alert).toHaveTextContent('Priya Nair is over-allocated: peak 170%');
    expect(alert).toHaveTextContent(WARNING.message);
    expect(alert).toHaveTextContent('170% from Nov 24, 2026 to Dec 6, 2026');
    expect(alert).toHaveTextContent('110% from Dec 7, 2026 to Dec 10, 2026');
    // The snackbar repeats the API's message; the capacity table and the list reload.
    await waitFor(() => expect(screen.getAllByText(WARNING.message)).toHaveLength(2));
    await waitFor(() => expect(getCapacity).toHaveBeenCalledTimes(2));
    expect(listAllocations).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog', { name: 'New allocation' })).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('capacity-warning')).not.toBeInTheDocument();
  });

  it('clears the warning once one of that person’s allocations is deleted', async () => {
    createAllocation.mockResolvedValue({ ...ALLOCATIONS.items[1], id: 9, capacity_warning: WARNING });
    deleteAllocation.mockResolvedValue(null);
    const { user } = renderPage('PM');
    await user.click(await screen.findByRole('button', { name: 'New allocation' }));
    const dialog = screen.getByRole('dialog', { name: 'New allocation' });
    await choose(user, /^Person/, 'Priya Nair', dialog);
    await choose(user, /^Project/, 'Project Beta: Brand Relaunch Campaign', dialog);
    await user.type(within(dialog).getByLabelText(/^Allocation/), '50');
    fireEvent.change(within(dialog).getByLabelText(/^Last day/), { target: { value: '2026-12-10' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }));
    expect(await screen.findByTestId('capacity-warning')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete allocation: Priya Nair on Project Beta: Brand Relaunch Campaign' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete allocation?' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteAllocation).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByTestId('capacity-warning')).not.toBeInTheDocument());
  });

  it('keeps the dialog open with field errors, and shows the snackbar, when a save fails', async () => {
    updateAllocation.mockRejectedValue(
      new ApiError({
        status: 400,
        error: 'VALIDATION_ERROR',
        message: 'The request is not valid.',
        details: [{ field: 'deliverable_id', issue: 'The deliverable belongs to another project.' }],
      }),
    );
    const { user } = renderPage('PM');
    await user.click(
      await screen.findByRole('button', { name: 'Edit allocation: Priya Nair on Project Alpha: Customer Payments Platform' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit allocation' });
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText('The deliverable belongs to another project.')).toBeInTheDocument();
    expect(within(dialog).getByText('The request is not valid.')).toBeInTheDocument();
    // Inline summary plus the app-wide snackbar (spec 12.4: a snackbar on failure).
    await waitFor(() => expect(screen.getAllByText('The request is not valid.')).toHaveLength(2));
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('confirms a plain save without a warning, and validates the form first', async () => {
    updateAllocation.mockResolvedValue({ ...ALLOCATIONS.items[0], allocation_percentage: 40, capacity_warning: null });
    const { user } = renderPage('ADMIN');
    await user.click(
      await screen.findByRole('button', { name: 'Edit allocation: Priya Nair on Project Alpha: Customer Payments Platform' }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit allocation' });
    const percentage = within(dialog).getByLabelText(/^Allocation/);
    expect(percentage).toHaveValue(60);
    await user.clear(percentage);
    await user.type(percentage, '140');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(within(dialog).getByText('Enter a whole number from 1 to 100.')).toBeInTheDocument();
    expect(updateAllocation).not.toHaveBeenCalled();

    await user.clear(percentage);
    await user.type(percentage, '40');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateAllocation).toHaveBeenCalledWith(1, {
        user_id: 5,
        project_id: 1,
        deliverable_id: 2,
        allocation_percentage: 40,
        start_date: '2026-11-14',
        end_date: '2026-12-14',
      }),
    );
    expect(await screen.findByText('Allocation updated.')).toBeInTheDocument();
    expect(screen.queryByTestId('capacity-warning')).not.toBeInTheDocument();
  });

  it('deletes an allocation after confirmation', async () => {
    deleteAllocation.mockResolvedValue(null);
    const { user } = renderPage('PM');
    await user.click(
      await screen.findByRole('button', { name: 'Delete allocation: Priya Nair on Project Beta: Brand Relaunch Campaign' }),
    );

    const confirm = screen.getByRole('dialog', { name: 'Delete allocation?' });
    expect(confirm).toHaveTextContent('60%, Nov 22, 2026 to Dec 6, 2026');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteAllocation).toHaveBeenCalledWith(2));
    expect(await screen.findByText('Allocation deleted.')).toBeInTheDocument();
    await waitFor(() => expect(getCapacity).toHaveBeenCalledTimes(2));
  });

  it('filters the allocations by person and project', async () => {
    const { user } = renderPage('VIEWER');
    const section = (await screen.findByRole('heading', { name: 'Allocations' })).closest('section');

    await choose(user, 'Person', 'Priya Nair', section);
    await waitFor(() =>
      expect(listAllocations).toHaveBeenLastCalledWith({ user_id: 5, limit: 25, offset: 0 }, expect.anything()),
    );
    await choose(user, 'Project', 'Project Alpha: Customer Payments Platform', section);
    await waitFor(() =>
      expect(listAllocations).toHaveBeenLastCalledWith({ user_id: 5, project_id: 1, limit: 25, offset: 0 }, expect.anything()),
    );
  });
});

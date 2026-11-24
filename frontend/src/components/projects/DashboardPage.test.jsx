import { screen, within } from '@testing-library/react';
import { DASHBOARD } from './testFixtures.js';
import DashboardPage from '../../pages/DashboardPage.jsx';
import { getDashboard } from '../../services/analytics.js';
import { ApiError } from '../../services/apiClient.js';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';

vi.mock('../../services/analytics.js');

// Every service is mocked: fail loudly if anything still reaches the network.
const unexpectedFetch = vi.fn(() => new Promise(() => {}));
beforeAll(() => vi.stubGlobal('fetch', unexpectedFetch));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => expect(unexpectedFetch).not.toHaveBeenCalled());


const ACTIVITY = [
  {
    id: 12,
    actor_id: 2,
    actor_email: 'pm@acme.example',
    entity_type: 'project',
    entity_id: 1,
    action: 'UPDATE',
    before_state: { project_name: 'Project Alpha' },
    after_state: { project_name: 'Project Alpha: Customer Payments Platform' },
    created_at: '2026-11-24T09:30:00Z',
  },
  {
    id: 11,
    actor_id: 1,
    actor_email: 'admin@acme.example',
    entity_type: 'deliverable',
    entity_id: 30,
    action: 'DELETE',
    before_state: { title: 'Old Spike', project_id: 1 },
    after_state: null,
    created_at: '2026-11-24T09:00:00Z',
  },
];

function renderDashboard(role = 'VIEWER', width) {
  return renderWithProviders(<DashboardPage />, { auth: makeAuthValue({ user: makeUser(role) }), width });
}

const tile = (label) => screen.getByText(label, { selector: 'p' }).parentElement;
const region = (name) => screen.getByRole('region', { name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDashboard).mockResolvedValue(DASHBOARD);
});

describe('DashboardPage', () => {
  it('shows the KPI tiles from live dashboard data', async () => {
    renderDashboard();

    expect(await screen.findByText('Portfolio status, risk, budget and capacity as of Nov 24, 2026.')).toBeInTheDocument();
    expect(tile('Projects')).toHaveTextContent('5');
    expect(within(tile('Projects')).getByRole('link', { name: '4 active' })).toHaveAttribute('href', '/projects?status=ACTIVE');
    expect(tile('Projects')).toHaveTextContent('4 active · 1 completed');
    expect(tile('High or critical risk')).toHaveTextContent('2');
    expect(within(tile('High or critical risk')).getByRole('link', { name: '1 critical · 1 high' })).toHaveAttribute('href', '/risk');
    expect(tile('Over-allocated people')).toHaveTextContent('1');
    expect(tile('Budget spent')).toHaveTextContent('$828.5K');
    expect(tile('Budget spent')).toHaveTextContent('76.7% of $1.1M planned · $251.5K left');
    expect(getDashboard).toHaveBeenCalledTimes(1);
  });

  it('lists the top risks with level, score and headline, linking to each Risk tab', async () => {
    renderDashboard();

    const topRisks = await screen.findByRole('region', { name: 'Top risks' });
    const items = within(topRisks).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Critical · 78')).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Project Alpha: Customer Payments Platform' })).toHaveAttribute(
      'href',
      '/projects/1?tab=risk',
    );
    expect(items[0]).toHaveTextContent(DASHBOARD.top_risks[0].headline);
    expect(within(items[1]).getByText('High · 61')).toBeInTheDocument();
    expect(within(items[2]).getByText('Medium · 31')).toBeInTheDocument();
  });

  it('offers every chart as a table with the same numbers', async () => {
    const { user } = renderDashboard();
    await screen.findByRole('region', { name: 'Top risks' });

    const statusCard = region('Projects by status');
    expect(within(statusCard).getByRole('figure', { name: /Active 4, On hold 0, Completed 1/ })).toBeInTheDocument();
    await user.click(within(statusCard).getByRole('button', { name: 'Table view' }));
    const statusTable = within(statusCard).getByRole('table', { name: 'Projects by status' });
    expect(within(statusTable).getAllByRole('row')).toHaveLength(6);
    expect(within(statusTable).getByText('Active').closest('tr')).toHaveTextContent('4');

    const riskCard = region('Risk distribution');
    expect(within(riskCard).getByText('2 of 5 at high or critical risk')).toBeInTheDocument();
    await user.click(within(riskCard).getByRole('button', { name: 'Table view' }));
    expect(within(riskCard).getByRole('link', { name: '1 critical risk projects' })).toHaveAttribute(
      'href',
      '/projects?risk_level=CRITICAL',
    );
    expect(within(riskCard).getByRole('link', { name: '2 low risk projects' })).toHaveAttribute(
      'href',
      '/projects?risk_level=LOW',
    );

    const budgetCard = region('Planned vs spent by department');
    await user.click(within(budgetCard).getByRole('button', { name: 'Table view' }));
    const rows = within(within(budgetCard).getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Engineering$400,000.00$300,000.0075.0%');
    expect(within(budgetCard).getByText('Operations').closest('tr')).toHaveTextContent('105.0%');

    await user.click(within(budgetCard).getByRole('button', { name: 'Chart view' }));
    expect(within(budgetCard).queryByRole('table')).not.toBeInTheDocument();
  });

  it.each(['LEAD', 'VIEWER'])('leaves recent activity out for %s, who may not read audit logs', async (role) => {
    vi.mocked(getDashboard).mockResolvedValue({ ...DASHBOARD, recent_activity: ACTIVITY });
    renderDashboard(role);
    await screen.findByRole('region', { name: 'Top risks' });

    expect(screen.queryByRole('region', { name: 'Recent activity' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-skeleton')).not.toBeInTheDocument();
  });

  it.each(['PM', 'ADMIN'])('shows %s an empty recent activity card before anything has changed', async (role) => {
    renderDashboard(role);

    expect(screen.getByTestId('activity-skeleton')).toBeInTheDocument();
    const activity = await screen.findByRole('region', { name: 'Recent activity' });
    expect(within(activity).getByText('No changes recorded yet')).toBeInTheDocument();
    expect(within(activity).queryByRole('listitem')).not.toBeInTheDocument();
    expect(within(activity).getByRole('link', { name: /Audit log/ })).toHaveAttribute('href', '/audit');
    expect(screen.queryByTestId('activity-skeleton')).not.toBeInTheDocument();
  });

  it('shows recent activity when the API returns it (ADMIN and PM)', async () => {
    vi.mocked(getDashboard).mockResolvedValue({ ...DASHBOARD, recent_activity: ACTIVITY });
    renderDashboard('PM');

    const activity = await screen.findByRole('region', { name: 'Recent activity' });
    const items = within(activity).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Updated')).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Project Alpha: Customer Payments Platform' })).toHaveAttribute(
      'href',
      '/projects/1',
    );
    expect(items[0]).toHaveTextContent('by pm@acme.example');
    expect(within(items[1]).getByText('Deleted')).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Deliverable Old Spike');
    expect(within(items[1]).queryByRole('link')).not.toBeInTheDocument();
    expect(within(activity).getByRole('link', { name: /Audit log/ })).toHaveAttribute('href', '/audit');
  });

  it('shows skeletons first and an error with retry when the dashboard fails', async () => {
    vi.mocked(getDashboard)
      .mockRejectedValueOnce(new ApiError({ status: 500, error: 'INTERNAL_ERROR', message: 'Database is resuming.' }))
      .mockResolvedValueOnce(DASHBOARD);
    const { user } = renderDashboard();

    expect(screen.getAllByTestId('chart-skeleton')).toHaveLength(3);
    expect(await screen.findByText('Database is resuming.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Top risks' })).toBeInTheDocument();
  });

  it('shows empty states for an empty portfolio', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      ...DASHBOARD,
      total_projects: 0,
      projects_by_status: { PLANNED: 0, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0, CANCELLED: 0 },
      risk_by_level: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
      departments: [],
      top_risks: [],
      over_allocated_count: 0,
    });
    renderDashboard();

    expect(await screen.findByText('No projects to rank')).toBeInTheDocument();
    expect(screen.getAllByText('No data yet')).toHaveLength(3);
    expect(tile('Projects')).toHaveTextContent('No projects yet');
  });

  it('shows each chart table view as stacked cards on a phone', async () => {
    const { user } = renderDashboard('VIEWER', PHONE_WIDTH);
    await screen.findByRole('region', { name: 'Top risks' });

    const budgetCard = region('Planned vs spent by department');
    await user.click(within(budgetCard).getByRole('button', { name: 'Table view' }));
    expect(within(budgetCard).queryByRole('table')).not.toBeInTheDocument();
    const cards = within(within(budgetCard).getByRole('list', { name: 'Planned vs spent by department' })).getAllByRole(
      'listitem',
    );
    expect(cards).toHaveLength(5);
    expect(within(cards[0]).getByRole('heading', { level: 3, name: 'Engineering' })).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent('Planned$400,000.00Spent$300,000.00Used75.0%');
    expect(within(cards[2]).getByRole('heading', { level: 3, name: 'Operations' })).toBeInTheDocument();
    expect(cards[2]).toHaveTextContent('Used105.0%');

    const statusCard = region('Projects by status');
    await user.click(within(statusCard).getByRole('button', { name: 'Table view' }));
    const statusCards = within(within(statusCard).getByRole('list', { name: 'Projects by status' })).getAllByRole(
      'listitem',
    );
    expect(statusCards).toHaveLength(5);
    expect(statusCards[1]).toHaveTextContent('ActiveProjects4');

    const riskCard = region('Risk distribution');
    await user.click(within(riskCard).getByRole('button', { name: 'Table view' }));
    expect(within(riskCard).getByRole('link', { name: '1 critical risk projects' })).toHaveAttribute(
      'href',
      '/projects?risk_level=CRITICAL',
    );
  });

  it('stacks everything in one column on a phone', async () => {
    renderDashboard('VIEWER', PHONE_WIDTH);

    expect(await screen.findByRole('region', { name: 'Top risks' })).toBeInTheDocument();
    expect(region('Key figures')).toBeInTheDocument();
  });
});

import { screen, within } from '@testing-library/react';
import BudgetPage from '../../pages/BudgetPage.jsx';
import { ApiError } from '../../services/apiClient.js';
import { getBudgetAnalytics } from '../../services/analytics.js';
import { makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';
import { BUDGET } from './testFixtures.js';

vi.mock('../../services/analytics.js', () => ({ getBudgetAnalytics: vi.fn() }));
// The charts have their own test; here a stand-in shows what the page hands them.
vi.mock('./BudgetCharts.jsx', () => ({
  default: ({ departments, projects }) => (
    <p>
      Charts: {departments.length} departments, {projects.length} projects
    </p>
  ),
}));

function renderPage() {
  return renderWithProviders(<BudgetPage />, { route: '/budget', auth: makeAuthValue({ user: makeUser('VIEWER') }) });
}

beforeEach(() => {
  getBudgetAnalytics.mockResolvedValue(BUDGET);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('BudgetPage', () => {
  it('shows portfolio totals and calls out projects over budget', async () => {
    renderPage();

    expect(await screen.findByText('Charts: 2 departments, 3 projects')).toBeInTheDocument();
    expect(screen.getByText('Planned budget').parentElement).toHaveTextContent('$850,000.00');
    expect(screen.getByText('Spent to date').parentElement).toHaveTextContent('$647,500.00');
    expect(screen.getByText('Remaining', { selector: 'p' }).parentElement).toHaveTextContent('$202,500.00');
    expect(screen.getByText('Budget used', { selector: 'p' }).parentElement).toHaveTextContent('76.2%');
    expect(screen.getByText('1 project is over budget')).toBeInTheDocument();
    expect(screen.getByText(/Project Delta: Warehouse Tracking Rollout: 105.0% of plan spent/)).toBeInTheDocument();
    expect(screen.getByText(/as of Nov 24, 2026/)).toBeInTheDocument();
  });

  it('lists every project with money, percentages and the divergence in words', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Budget by project' });

    const alpha = within(table).getByRole('link', { name: 'Project Alpha: Customer Payments Platform' });
    expect(alpha).toHaveAttribute('href', '/projects/1?tab=budget');
    const alphaRow = alpha.closest('tr');
    expect(alphaRow).toHaveTextContent('$400,000.00');
    expect(alphaRow).toHaveTextContent('$300,000.00');
    expect(alphaRow).toHaveTextContent('75.0%');
    expect(alphaRow).toHaveTextContent('35.0%');
    expect(within(alphaRow).getByText('+40.0 pts')).toBeInTheDocument();
    expect(within(alphaRow).getByText('Spending well ahead of progress')).toBeInTheDocument();

    const gammaRow = within(table).getByText('Project Gamma: Ledger Automation').closest('tr');
    expect(within(gammaRow).getByText('−5.0 pts')).toBeInTheDocument();
    expect(within(gammaRow).getByText('Progress ahead of spending')).toBeInTheDocument();

    const deltaRow = within(table).getByText('Project Delta: Warehouse Tracking Rollout').closest('tr');
    expect(within(deltaRow).getByText('-$10,000.00')).toBeInTheDocument();
    expect(within(deltaRow).getByText('Over budget')).toBeInTheDocument();
  });

  it('rolls up departments with their project count and weighted completion', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Budget by department' });

    const engineering = within(table).getByText('Engineering').closest('tr');
    expect(within(engineering).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Engineering',
      '1',
      '$400,000.00',
      '$300,000.00',
      '$100,000.00',
      '75.0%',
      '35.0%',
      '+40.0 ptsSpending well ahead of progress',
    ]);
    const operations = within(table).getByText('Operations').closest('tr');
    expect(operations).toHaveTextContent('Over budget');
    expect(operations).toHaveTextContent('+50.0 pts');
  });

  it('shows an error with a retry instead of empty numbers', async () => {
    getBudgetAnalytics.mockRejectedValueOnce(new ApiError({ status: 500, error: 'INTERNAL_ERROR', message: 'Boom.' }));
    const { user } = renderWithProviders(<BudgetPage />, { auth: makeAuthValue({ user: makeUser('PM') }) });

    expect(await screen.findByText('Boom.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table', { name: 'Budget by project' })).toBeInTheDocument();
  });
});

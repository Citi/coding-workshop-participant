import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import RiskChip from '../RiskChip.jsx';
import RiskPage from '../../pages/RiskPage.jsx';
import { ApiError } from '../../services/apiClient.js';
import { getRiskAnalytics } from '../../services/analytics.js';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';
import { RISK } from './testFixtures.js';

vi.mock('../../services/analytics.js', () => ({ getRiskAnalytics: vi.fn() }));

function ProjectRoute() {
  const location = useLocation();
  return <p>Opened {`${location.pathname}${location.search}`}</p>;
}

function renderPage(options = {}) {
  return renderWithProviders(
    <Routes>
      <Route path="/risk" element={<RiskPage />} />
      <Route path="/projects/:id" element={<ProjectRoute />} />
    </Routes>,
    { route: '/risk', auth: makeAuthValue({ user: makeUser('VIEWER') }), ...options },
  );
}

beforeEach(() => {
  getRiskAnalytics.mockResolvedValue(RISK);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RiskChip carries the level as text, not colour alone', () => {
  it.each([
    ['LOW', 'Low'],
    ['MEDIUM', 'Medium'],
    ['HIGH', 'High'],
    ['CRITICAL', 'Critical'],
  ])('names %s in its text and its title', (level, text) => {
    renderWithProviders(<RiskChip level={level} />);

    const chip = screen.getByText(text).closest('.MuiChip-root');
    expect(chip).toHaveTextContent(new RegExp(`^${text}$`));
    expect(chip).toHaveAttribute('title', `Risk ${text.toLowerCase()}`);
  });

  it('gives every level a different label, so levels differ even without colour', () => {
    renderWithProviders(
      <>
        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => (
          <RiskChip key={level} level={level} score={50} />
        ))}
      </>,
    );

    const labels = Array.from(document.querySelectorAll('.MuiChip-label')).map((node) => node.textContent);
    expect(labels).toEqual(['Low · 50', 'Medium · 50', 'High · 50', 'Critical · 50']);
    expect(new Set(labels).size).toBe(4);
  });
});

describe('RiskPage', () => {
  it('ranks projects by score with level, score, status, department and headline', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: 'Projects ranked by risk' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['#1', '#2', '#3', '#4']);
    expect(rows[0]).toHaveTextContent('Project Alpha: Customer Payments Platform');
    expect(within(rows[0]).getByText('Critical')).toBeInTheDocument();
    expect(within(rows[0]).getByText('78 of 100')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Active')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Engineering')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("2 deliverables are overdue: 'API Schema'");
    expect(rows[0]).toHaveTextContent('Schedule 16/20 · Dependency blast radius 15/20 · Budget vs progress 15/20');
    expect(within(rows[1]).getByText('High')).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent('Scoring factors: No factor triggered');

    const summary = screen.getByRole('heading', { name: 'Projects by risk level' }).parentElement;
    expect(summary).toHaveTextContent('Critical1 project');
    expect(summary).toHaveTextContent('Low1 project');
  });

  it('opens the project Risk tab when a row is clicked', async () => {
    const { user } = renderPage();
    const table = await screen.findByRole('table', { name: 'Projects ranked by risk' });

    await user.click(within(table).getByText('Project Delta: Warehouse Tracking Rollout'));
    expect(await screen.findByText('Opened /projects/4?tab=risk')).toBeInTheDocument();
  });

  it('supports the keyboard on rows', async () => {
    const { user } = renderPage();
    const table = await screen.findByRole('table', { name: 'Projects ranked by risk' });

    within(table).getByText('Project Beta: Brand Relaunch Campaign').closest('tr').focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Opened /projects/2?tab=risk')).toBeInTheDocument();
  });

  it('filters by level and by search text on the client', async () => {
    const { user } = renderPage();
    const table = await screen.findByRole('table', { name: 'Projects ranked by risk' });

    await user.click(screen.getByRole('combobox', { name: 'Risk level' }));
    await user.click(screen.getByRole('option', { name: 'High' }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(table).toHaveTextContent('Project Delta');
    // The rank stays the portfolio rank.
    expect(table).toHaveTextContent('#2');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'marketing');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(table).toHaveTextContent('Project Beta');

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), ' nothing');
    expect(await screen.findByText('No projects match these filters')).toBeInTheDocument();
    expect(getRiskAnalytics).toHaveBeenCalledTimes(1);
  });

  it('opens a project from its card on phones', async () => {
    const { user } = renderPage({ width: PHONE_WIDTH });

    const list = await screen.findByRole('list', { name: 'Projects ranked by risk' });
    await user.click(within(list).getByText('Project Alpha: Customer Payments Platform'));
    expect(await screen.findByText('Opened /projects/1?tab=risk')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    getRiskAnalytics.mockRejectedValueOnce(new ApiError({ status: 0, error: 'NETWORK_ERROR', message: 'Could not reach the server.' }));
    const { user } = renderPage();

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table', { name: 'Projects ranked by risk' })).toBeInTheDocument();
  });
});

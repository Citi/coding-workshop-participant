import { screen, waitFor, within } from '@testing-library/react';
import RiskTab from './RiskTab.jsx';
import { ALPHA_RISK, EPSILON_RISK } from './testFixtures.js';
import { ApiError } from '../../services/apiClient.js';
import { getProjectRisk } from '../../services/projects.js';
import { makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';

vi.mock('../../services/projects.js');

// Every service is mocked: fail loudly if anything still reaches the network.
const unexpectedFetch = vi.fn(() => new Promise(() => {}));
beforeAll(() => vi.stubGlobal('fetch', unexpectedFetch));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => expect(unexpectedFetch).not.toHaveBeenCalled());


function renderRisk(projectId = 1) {
  return renderWithProviders(<RiskTab project={{ id: projectId }} />, {
    auth: makeAuthValue({ user: makeUser('VIEWER') }),
  });
}

const section = (name) => screen.getByRole('region', { name });

describe('RiskTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getProjectRisk).mockResolvedValue(ALPHA_RISK);
  });

  it('shows the score out of 100 and the level as text', async () => {
    renderRisk();

    expect(await screen.findByTestId('risk-score')).toHaveTextContent('78');
    const scoreCard = section('Risk score');
    expect(scoreCard).toHaveTextContent('78/ 100');
    expect(within(scoreCard).getByText('Critical').closest('.MuiChip-root')).toHaveClass('MuiChip-colorRiskCritical');
    expect(scoreCard).toHaveTextContent('As of Nov 24, 2026.');
    expect(getProjectRisk).toHaveBeenCalledWith(1, {}, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('charts one bar per factor with its points out of the maximum, and lists each detail in text', async () => {
    renderRisk();
    await screen.findByTestId('risk-score');

    const expected = [
      ['schedule', 'Schedule', 16, 20, '2 overdue deliverables'],
      ['blocked', 'Blocked deliverables', 10, 15, '1 blocked deliverable'],
      ['blast_radius', 'Dependency blast radius', 15, 20, '3 impacted deliverables'],
      ['resource', 'Resource over-allocation', 12, 15, '1 over-allocated person, 1 compound bottleneck'],
      ['budget', 'Budget vs progress', 15, 20, '75.0% spent at 35.0% complete'],
      ['deadline', 'Deadline proximity', 10, 10, '25 days left at 35.0% complete'],
    ];
    const chart = within(section('What the score is made of')).getByRole('figure');
    expect(chart).toHaveAccessibleName(
      `Risk factors: ${expected.map(([, label, points, max]) => `${label} ${points} of ${max} points`).join('; ')}.`,
    );
    expected.forEach(([key, label, , , detail]) => {
      const row = screen.getByTestId(`risk-factor-${key}`);
      expect(within(row).getByRole('term')).toHaveTextContent(`${label}:`);
      expect(within(row).getByRole('definition')).toHaveTextContent(detail);
    });
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });

  it('lists the evidence, the recommended actions and the impacted deliverables', async () => {
    renderRisk();
    await screen.findByTestId('risk-score');

    const evidence = section('Evidence');
    expect(within(evidence).getAllByRole('listitem')).toHaveLength(ALPHA_RISK.evidence.length);
    ALPHA_RISK.evidence.forEach((line) => expect(within(evidence).getByText(line)).toBeInTheDocument());

    const actions = section('Recommended actions');
    expect(within(actions).getAllByRole('listitem')).toHaveLength(ALPHA_RISK.recommended_actions.length);
    expect(
      within(actions).getByText(/Escalate the blocker on 'API Schema' \(owner: Priya Nair\)/),
    ).toBeInTheDocument();

    const impacted = section('Impacted deliverables');
    expect(within(impacted).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('impacted-3')).toHaveTextContent('Payments Service Integration');
    expect(screen.getByTestId('impacted-3')).toHaveTextContent('Held up by API Schema · 1 step downstream');
    expect(screen.getByTestId('impacted-5')).toHaveTextContent('End-to-End Testing');
    expect(screen.getByTestId('impacted-5')).toHaveTextContent('Held up by API Schema · 2 steps downstream');
    expect(within(screen.getByTestId('impacted-4')).getByText('Impacted')).toBeInTheDocument();
  });

  it('never mentions a critical path or slack', async () => {
    renderRisk();
    await screen.findByTestId('risk-score');

    expect(document.body).not.toHaveTextContent(/critical path|slack/i);
  });

  it('explains a closed project with a zero score and no actions', async () => {
    vi.mocked(getProjectRisk).mockResolvedValue(EPSILON_RISK);
    renderRisk(5);

    expect(await screen.findByTestId('risk-score')).toHaveTextContent('0');
    expect(within(section('Risk score')).getByText('Low')).toBeInTheDocument();
    const chart = within(section('What the score is made of')).getByRole('figure');
    expect(chart.getAttribute('aria-label').match(/ 0 of \d+ points/g)).toHaveLength(6);
    expect(within(section('Evidence')).getByText(EPSILON_RISK.evidence[0])).toBeInTheDocument();
    expect(screen.getByText('No action needed: no risk factor scored points.')).toBeInTheDocument();
    expect(screen.getByText('No deliverables are held up by a blocked or overdue item.')).toBeInTheDocument();
  });

  it('fetches again when the page bumps the revision, keeping the old detail on screen meanwhile', async () => {
    let finishRefresh;
    vi.mocked(getProjectRisk)
      .mockResolvedValueOnce(ALPHA_RISK)
      .mockImplementationOnce(() => new Promise((resolve) => (finishRefresh = resolve)));
    const auth = makeAuthValue({ user: makeUser('VIEWER') });
    const { rerender } = renderWithProviders(<RiskTab project={{ id: 1 }} revision={0} />, { auth });
    expect(await screen.findByTestId('risk-score')).toHaveTextContent('78');

    rerender(<RiskTab project={{ id: 1 }} revision={1} />);
    expect(await screen.findByRole('progressbar', { name: 'Recalculating the risk score' })).toBeInTheDocument();
    expect(screen.getByTestId('risk-score')).toHaveTextContent('78');
    expect(screen.queryByLabelText('Loading risk detail')).not.toBeInTheDocument();

    finishRefresh({ ...ALPHA_RISK, risk_score: 58, risk_level: 'HIGH' });
    await waitFor(() => expect(screen.getByTestId('risk-score')).toHaveTextContent('58'));
    expect(screen.queryByRole('progressbar', { name: 'Recalculating the risk score' })).not.toBeInTheDocument();
    expect(getProjectRisk).toHaveBeenCalledTimes(2);

    rerender(<RiskTab project={{ id: 1 }} revision={1} />);
    expect(getProjectRisk).toHaveBeenCalledTimes(2);
  });

  it('keeps the last detail and offers a retry when a refresh fails', async () => {
    vi.mocked(getProjectRisk)
      .mockResolvedValueOnce(ALPHA_RISK)
      .mockRejectedValueOnce(new ApiError({ status: 503, error: 'INTERNAL_ERROR', message: 'Service unavailable.' }))
      .mockResolvedValueOnce(ALPHA_RISK);
    const auth = makeAuthValue({ user: makeUser('VIEWER') });
    const { rerender, user } = renderWithProviders(<RiskTab project={{ id: 1 }} revision={0} />, { auth });
    await screen.findByTestId('risk-score');

    rerender(<RiskTab project={{ id: 1 }} revision={1} />);
    expect(await screen.findByText('Could not refresh the risk detail')).toBeInTheDocument();
    expect(screen.getByTestId('risk-score')).toHaveTextContent('78');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Could not refresh the risk detail')).not.toBeInTheDocument());
    expect(getProjectRisk).toHaveBeenCalledTimes(3);
  });

  it('shows skeletons while loading, then an error with a working retry', async () => {
    vi.mocked(getProjectRisk)
      .mockRejectedValueOnce(new ApiError({ status: 500, error: 'INTERNAL_ERROR', message: 'Database is resuming.' }))
      .mockResolvedValueOnce(ALPHA_RISK);
    const { user } = renderRisk();

    expect(screen.getByLabelText('Loading risk detail')).toBeInTheDocument();
    expect(await screen.findByText('Database is resuming.')).toBeInTheDocument();
    expect(screen.getByText('Could not load the risk detail')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('risk-score')).toHaveTextContent('78');
    expect(getProjectRisk).toHaveBeenCalledTimes(2);
  });
});

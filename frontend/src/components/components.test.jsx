import { screen } from '@testing-library/react';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmptyState from './EmptyState.jsx';
import ErrorState from './ErrorState.jsx';
import EvidenceList from './EvidenceList.jsx';
import FilterBar from './FilterBar.jsx';
import KpiTile from './KpiTile.jsx';
import LoadingState from './LoadingState.jsx';
import MoneyText from './MoneyText.jsx';
import PageHeader from './PageHeader.jsx';
import RiskChip from './RiskChip.jsx';
import StatusChip from './StatusChip.jsx';
import { ApiError } from '../services/apiClient.js';
import { renderWithProviders } from '../test/utils.jsx';

describe('RiskChip', () => {
  it.each([
    ['LOW', 0, 'Low · 0', 'MuiChip-colorRiskLow'],
    ['MEDIUM', 31, 'Medium · 31', 'MuiChip-colorRiskMedium'],
    ['HIGH', 61, 'High · 61', 'MuiChip-colorRiskHigh'],
    ['CRITICAL', 78, 'Critical · 78', 'MuiChip-colorRiskCritical'],
  ])('shows %s with its score as text and its theme colour', (level, score, label, colourClass) => {
    renderWithProviders(<RiskChip level={level} score={score} />);

    const chip = screen.getByText(label).closest('.MuiChip-root');
    expect(chip).toHaveClass(colourClass);
    expect(chip).toHaveAttribute('title', `Risk ${label.split(' ')[0].toLowerCase()}, score ${score} of 100`);
  });

  it('shows the level alone without a score and handles unknown levels', () => {
    renderWithProviders(
      <>
        <RiskChip level="HIGH" />
        <RiskChip />
      </>,
    );

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

describe('StatusChip', () => {
  it.each([
    ['ON_HOLD', 'On hold', 'MuiChip-colorWarning'],
    ['BLOCKED', 'Blocked', 'MuiChip-colorError'],
    ['DONE', 'Done', 'MuiChip-colorSuccess'],
    ['OVER_ALLOCATED', 'Over-allocated', 'MuiChip-colorError'],
    ['ACTIVE', 'Active', 'MuiChip-colorPrimary'],
  ])('labels %s as "%s"', (status, label, colourClass) => {
    renderWithProviders(<StatusChip status={status} />);

    expect(screen.getByText(label).closest('.MuiChip-root')).toHaveClass(colourClass);
  });

  it('uses an outlined neutral chip and readable text for other values', () => {
    renderWithProviders(<StatusChip status="SOMETHING_NEW" />);

    expect(screen.getByText('Something new').closest('.MuiChip-root')).toHaveClass('MuiChip-outlined');
  });
});

describe('MoneyText', () => {
  it('formats API decimal strings in the single currency', () => {
    renderWithProviders(<MoneyText value="400000.00" />);
    expect(screen.getByText('$400,000.00')).toBeInTheDocument();
  });

  it('supports a compact form with the full amount as a tooltip', () => {
    renderWithProviders(<MoneyText value="1250000" compact />);
    expect(screen.getByText('$1.3M')).toHaveAttribute('title', '$1,250,000.00');
  });

  it('highlights overspend and shows a dash for missing values', () => {
    renderWithProviders(
      <>
        <MoneyText value="-10000.00" highlightNegative />
        <MoneyText value={null} />
      </>,
    );
    expect(screen.getByText('-$10,000.00')).toHaveStyle({ color: 'rgb(211, 47, 47)' });
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'ON_HOLD', label: 'On hold' },
  ];

  it('reports search text, select and checkbox changes', async () => {
    const onSearchChange = vi.fn();
    const onFilterChange = vi.fn();
    const { user } = renderWithProviders(
      <FilterBar
        searchValue=""
        onSearchChange={onSearchChange}
        searchLabel="Search projects"
        filters={[
          { name: 'status', label: 'Status', value: '', options: statusOptions },
          { name: 'overdue', label: 'Overdue only', type: 'checkbox', value: false },
        ]}
        onFilterChange={onFilterChange}
      />,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'a');
    expect(onSearchChange).toHaveBeenCalledWith('a');

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'On hold' }));
    expect(onFilterChange).toHaveBeenCalledWith('status', 'ON_HOLD');

    await user.click(screen.getByRole('checkbox', { name: 'Overdue only' }));
    expect(onFilterChange).toHaveBeenCalledWith('overdue', true);
  });

  it('enables "Clear filters" only when a filter is active', async () => {
    const onClear = vi.fn();
    const { user, rerender } = renderWithProviders(
      <FilterBar filters={[{ name: 'status', label: 'Status', value: '', options: statusOptions }]} onClear={onClear} />,
    );
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();

    rerender(
      <FilterBar
        filters={[{ name: 'status', label: 'Status', value: 'ACTIVE', options: statusOptions }]}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog', () => {
  it('focuses Cancel and reports the choice', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { user } = renderWithProviders(
      <ConfirmDialog
        open
        title="Delete project?"
        message="This also deletes its deliverables."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
    expect(dialog).toHaveAccessibleDescription('This also deletes its deliverables.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while the action runs', () => {
    renderWithProviders(<ConfirmDialog open loading onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

describe('feedback states and page parts', () => {
  it('LoadingState announces its message', () => {
    renderWithProviders(<LoadingState message="Loading projects…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects…');
    expect(screen.getByRole('progressbar', { name: 'Loading projects…' })).toBeInTheDocument();
  });

  it('EmptyState shows its title, message and action', () => {
    renderWithProviders(<EmptyState title="No risks" message="All clear." action={<button type="button">Go</button>} />);
    expect(screen.getByText('No risks')).toBeInTheDocument();
    expect(screen.getByText('All clear.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('ErrorState titles errors by status and accepts strings', () => {
    renderWithProviders(
      <>
        <ErrorState error={new ApiError({ status: 404, error: 'NOT_FOUND', message: 'Project not found.' })} />
        <ErrorState error="Plain message" title="Custom title" />
      </>,
    );
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.getByText('Plain message')).toBeInTheDocument();
  });

  it('EvidenceList renders evidence, actions and an empty message', () => {
    renderWithProviders(
      <>
        <EvidenceList title="Evidence" items={['75.0% of the planned budget is consumed.']} />
        <EvidenceList title="Recommended actions" variant="action" items={["Escalate the blocker on 'API Schema'."]} />
        <EvidenceList title="Nothing" items={[]} emptyMessage="No evidence." />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByText('75.0% of the planned budget is consumed.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recommended actions' })).toHaveTextContent("Escalate the blocker on 'API Schema'.");
    expect(screen.getByText('No evidence.')).toBeInTheDocument();
  });

  it('KpiTile shows a label, value and hint, or a skeleton while loading', () => {
    const { rerender } = renderWithProviders(<KpiTile label="Active projects" value={4} hint="of 5 in total" tone="primary" />);
    expect(screen.getByText('Active projects')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('of 5 in total')).toBeInTheDocument();

    rerender(<KpiTile label="Active projects" value={4} loading />);
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('PageHeader renders the h1 and sets the browser tab title', () => {
    renderWithProviders(<PageHeader title="Risk Intelligence" subtitle="Ranked by score" actions={<button type="button">Export</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Risk Intelligence' })).toBeInTheDocument();
    expect(screen.getByText('Ranked by score')).toBeInTheDocument();
    expect(document.title).toBe('Risk Intelligence | ACME Project Intelligence');
  });
});

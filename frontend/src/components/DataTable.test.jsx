import { screen, within } from '@testing-library/react';
import Button from '@mui/material/Button';
import DataTable from './DataTable.jsx';
import RiskChip from './RiskChip.jsx';
import { PHONE_WIDTH, renderWithProviders } from '../test/utils.jsx';

const COLUMNS = [
  { field: 'project_name', header: 'Project', primary: true },
  { field: 'department_name', header: 'Department' },
  { field: 'risk_level', header: 'Risk', render: (row) => <RiskChip level={row.risk_level} score={row.risk_score} /> },
  { field: 'description', header: 'Description', hideOnMobile: true },
];

const ROWS = [
  { id: 1, project_name: 'Project Alpha', department_name: 'Engineering', risk_level: 'CRITICAL', risk_score: 78, description: null },
  { id: 2, project_name: 'Project Beta', department_name: 'Marketing', risk_level: 'MEDIUM', risk_score: 31, description: 'Relaunch' },
];

describe('DataTable on desktop', () => {
  it('renders a table with headers, cells and custom renderers', () => {
    renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} ariaLabel="Projects" />);

    const table = screen.getByRole('table', { name: 'Projects' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Project',
      'Department',
      'Risk',
      'Description',
    ]);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Critical · 78')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  it('supports row clicks by mouse and keyboard, and per-row actions', async () => {
    const onRowClick = vi.fn();
    const onEdit = vi.fn();
    const { user } = renderWithProviders(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        onRowClick={onRowClick}
        rowActions={(row) => <Button onClick={() => onEdit(row.id)}>Edit {row.project_name}</Button>}
      />,
    );

    await user.click(screen.getByText('Project Alpha'));
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[0]);

    screen.getByText('Project Beta').closest('tr').focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);

    await user.click(screen.getByRole('button', { name: 'Edit Project Beta' }));
    expect(onEdit).toHaveBeenCalledWith(2);
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('shows skeleton rows while loading the first page', () => {
    renderWithProviders(<DataTable columns={COLUMNS} rows={[]} loading />);

    expect(screen.getAllByTestId('table-skeleton-row')).toHaveLength(5);
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  it('keeps rows visible with a progress bar while refreshing', () => {
    renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} loading />);

    expect(screen.getByRole('progressbar', { name: 'Refreshing' })).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
  });

  it('shows an empty state with an action', () => {
    renderWithProviders(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        emptyTitle="No projects match"
        emptyMessage="Try clearing the filters."
        emptyAction={<Button>New project</Button>}
      />,
    );

    expect(screen.getByText('No projects match')).toBeInTheDocument();
    expect(screen.getByText('Try clearing the filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error with a retry button', async () => {
    const onRetry = vi.fn();
    const { user } = renderWithProviders(
      <DataTable columns={COLUMNS} rows={[]} error={new Error('Server unavailable')} onRetry={onRetry} />,
    );

    expect(screen.getByText('Server unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('paginates on the server', async () => {
    const onPageChange = vi.fn();
    const onRowsPerPageChange = vi.fn();
    const { user } = renderWithProviders(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        pagination={{ total: 30, page: 0, rowsPerPage: 10, onPageChange, onRowsPerPageChange }}
      />,
    );

    expect(screen.getByText('1–10 of 30')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(screen.getByRole('option', { name: '25' }));
    expect(onRowsPerPageChange).toHaveBeenCalledWith(25);
  });
});

describe('DataTable on a phone', () => {
  it('renders stacked cards with labelled values instead of a table', () => {
    renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} ariaLabel="Projects" />, { width: PHONE_WIDTH });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cards = within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(within(cards[0]).getByText('Department')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Engineering')).toBeInTheDocument();
    expect(within(cards[0]).queryByText('Description')).not.toBeInTheDocument();
  });

  it('makes cards clickable and keeps row actions', async () => {
    const onRowClick = vi.fn();
    const { user } = renderWithProviders(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        onRowClick={onRowClick}
        rowActions={(row) => <Button>Delete {row.project_name}</Button>}
      />,
      { width: PHONE_WIDTH },
    );

    await user.click(screen.getByText('Project Beta'));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
    expect(screen.getByRole('button', { name: 'Delete Project Alpha' })).toBeInTheDocument();
  });

  it('shows card skeletons while loading', () => {
    renderWithProviders(<DataTable columns={COLUMNS} rows={[]} loading />, { width: PHONE_WIDTH });

    expect(screen.getAllByTestId('card-skeleton')).toHaveLength(3);
  });
});

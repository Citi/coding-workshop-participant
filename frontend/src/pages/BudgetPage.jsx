import { useState } from 'react';
import { Alert, Button, Grid, IconButton, Stack, Tab, Tabs, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatTile from '../components/dashboard/StatTile';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';
import RoleGate from '../components/auth/RoleGate';
import BudgetBar from '../components/budget/BudgetBar';
import ExpenseForm from '../components/budget/ExpenseForm';
import useApi from '../hooks/useApi';
import useProjects from '../hooks/useProjects';
import {
  createExpense,
  deleteExpense,
  listBudgets,
  listExpenses,
} from '../services/budgetService';
import { ACTIONS, EXPENSE_CATEGORY_OPTIONS } from '../utils/constants';
import { formatCurrency, formatDate, humanise } from '../utils/formatters';

/**
 * "How much budget has been consumed versus planned for each project?"
 *
 * Two views of the same data: the per-project roll-up, and the expense lines
 * that produce it. Team Leaders and Stakeholders can see both but not change
 * them -- view_budgets without manage_budgets.
 */
export default function BudgetPage() {
  const { projects } = useProjects();

  const [tab, setTab] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [notice, setNotice] = useState(null);

  const budgets = useApi(listBudgets, { immediate: true, initialData: [] });
  const expenses = useApi(listExpenses, { immediate: tab === 1, deps: [tab], initialData: [] });

  const budgetRows = budgets.data ?? [];
  const overspent = budgetRows.filter((row) => row.isOverspent);

  const totals = budgetRows.reduce(
    (acc, row) => ({
      planned: acc.planned + Number(row.plannedBudget ?? 0),
      consumed: acc.consumed + Number(row.budgetConsumed ?? 0),
    }),
    { planned: 0, consumed: 0 },
  );

  const expenseRows = (expenses.data ?? []).filter(
    (row) => !categoryFilter || row.category === categoryFilter,
  );

  const handleCreate = async (payload) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const created = await createExpense(payload);
      setFormOpen(false);
      // A 201 can still carry a warning when this entry tips the project over.
      if (created.budgetWarning) setNotice(created.budgetWarning.message);
      await Promise.all([budgets.refresh(), expenses.refresh()]);
    } catch (caught) {
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setServerError(null);
    try {
      await deleteExpense(deleting.id);
      setDeleting(null);
      await Promise.all([budgets.refresh(), expenses.refresh()]);
    } catch (caught) {
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const budgetColumns = [
    { field: 'projectName', header: 'Project', primary: true },
    { field: 'status', header: 'Status', render: (row) => <StatusChip value={row.status} /> },
    {
      field: 'plannedBudget',
      header: 'Planned',
      align: 'right',
      render: (row) => formatCurrency(row.plannedBudget),
    },
    {
      field: 'budgetConsumed',
      header: 'Consumed',
      align: 'right',
      render: (row) => formatCurrency(row.budgetConsumed),
    },
    {
      field: 'variance',
      header: 'Variance',
      align: 'right',
      render: (row) => (
        <Typography
          variant="body2"
          fontWeight={600}
          color={row.isOverspent ? 'error.main' : 'success.main'}
        >
          {formatCurrency(row.variance)}
        </Typography>
      ),
    },
    {
      field: 'consumedRatio',
      header: 'Progress',
      sortable: false,
      render: (row) => (
        <BudgetBar
          planned={row.plannedBudget}
          consumed={row.budgetConsumed}
          showLabels={false}
        />
      ),
    },
  ];

  const expenseColumns = [
    {
      field: 'description',
      header: 'Description',
      primary: true,
      render: (row) => row.description || '(no description)',
    },
    { field: 'projectName', header: 'Project', hideOnMobile: true },
    {
      field: 'category',
      header: 'Category',
      render: (row) => humanise(row.category),
    },
    {
      field: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => formatCurrency(row.amount),
    },
    { field: 'incurredOn', header: 'Date', render: (row) => formatDate(row.incurredOn) },
  ];

  const recordButton = (
    <RoleGate action={ACTIONS.MANAGE_BUDGETS}>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
        Record expense
      </Button>
    </RoleGate>
  );

  return (
    <>
      <PageHeader title="Budget" subtitle="Consumed versus planned" actions={recordButton} />

      {notice && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {overspent.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {overspent.length} project{overspent.length === 1 ? ' is' : 's are'} over budget:{' '}
          {overspent.map((row) => row.projectName).join(', ')}.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatTile label="Planned" value={formatCurrency(totals.planned)} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatTile label="Consumed" value={formatCurrency(totals.consumed)} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatTile
            label="Variance"
            value={formatCurrency(totals.planned - totals.consumed)}
            emphasis={totals.consumed > totals.planned ? 'error' : 'success'}
          />
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ mb: 2 }}>
        <Tab label="By project" />
        <Tab label="Expenses" />
      </Tabs>

      {tab === 0 && (
        <DataTable
          columns={budgetColumns}
          rows={budgetRows}
          rowKey="projectId"
          loading={budgets.loading}
          error={budgets.error}
          onRetry={budgets.refresh}
          searchPlaceholder="Search projects…"
          emptyTitle="No budgets yet"
          emptyDescription="Set a planned budget on a project to start tracking consumption."
        />
      )}

      {tab === 1 && (
        <DataTable
          columns={expenseColumns}
          rows={expenseRows}
          loading={expenses.loading}
          error={expenses.error}
          onRetry={expenses.refresh}
          initialSortBy="incurredOn"
          searchPlaceholder="Search expenses…"
          filters={[
            {
              name: 'category',
              label: 'Category',
              value: categoryFilter,
              onChange: setCategoryFilter,
              options: EXPENSE_CATEGORY_OPTIONS,
            },
          ]}
          emptyTitle="No expenses recorded"
          emptyDescription="Record spend against a project to track consumption."
          emptyAction={recordButton}
          renderRowActions={(row) => (
            <RoleGate action={ACTIONS.MANAGE_BUDGETS} mode="disable">
              <IconButton
                size="small"
                color="error"
                aria-label="Delete expense"
                onClick={() => setDeleting(row)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </RoleGate>
          )}
        />
      )}

      <ExpenseForm
        open={formOpen}
        projects={projects}
        onSubmit={handleCreate}
        onClose={() => setFormOpen(false)}
        submitting={submitting}
        serverError={serverError}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this expense?"
        message={
          <Stack spacing={0.5}>
            <span>{deleting?.description || '(no description)'}</span>
            <strong>{formatCurrency(deleting?.amount)}</strong>
          </Stack>
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        loading={submitting}
        error={serverError}
      />
    </>
  );
}

import { useCallback, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import DataTable from '../../components/DataTable'
import FilterBar from '../../components/FilterBar'
import { ErrorState } from '../../components/StateViews'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { expensesApi } from '../../services/expensesApi'
import { formatCurrency, formatDate } from '../../utils/format'
import { sortLabel } from '../../utils/labels'
import { sumMoney } from './budgetMetrics'
import DateRangeFilter from './DateRangeFilter'
import ExpenseDialogs from './ExpenseDialogs'
import { dateRangeError, expenseFilters, withFilter } from './expenseFields'
import ProjectLink from './ProjectLink'
import { useProjectOptions } from './useProjectOptions'
import { hasActiveFilters } from '../../utils/filters'
import { countLabel } from '../../utils/text'

function buildColumns(showProject) {
  return [
    { field: 'expense_date', header: 'Date', sortable: true, render: (row) => formatDate(row.expense_date) },
    ...(showProject
      ? [
          {
            field: 'project_name',
            header: 'Project',
            sortable: true,
            render: (row) => <ProjectLink id={row.project_id} name={row.project_name} />,
          },
        ]
      : []),
    {
      field: 'category',
      header: 'Category',
      sortable: true,
      sortValue: (row) => sortLabel('category', row.category),
      render: (row) => <StatusChip kind="category" value={row.category} />,
    },
    {
      field: 'description',
      header: 'Description',
      sortable: true,
      render: (row) => (
        <Box component="span" sx={{ wordBreak: 'break-word' }}>
          {row.description}
        </Box>
      ),
    },
    { field: 'amount', header: 'Amount', align: 'right', sortable: true, render: (row) => formatCurrency(row.amount) },
  ]
}

function emptyText(filtered, canCreate, fixed) {
  if (filtered) return { title: 'No matching expenses', message: 'No expense matches these filters. Try changing or clearing them.' }
  return {
    title: fixed ? 'No expenses for this project yet' : 'No expenses yet',
    message: canCreate
      ? 'Record the first expense to start tracking the money spent against the budget.'
      : 'Expenses will appear here once they are recorded.',
  }
}

/**
 * Expenses (budget consumption) list + filters + create/edit/delete.
 * Props: { projectId?: number, onChange?: () => void }
 *  - projectId: only that project's expenses; the form's project is fixed to it (a numeric string works too)
 *  - onChange: called after any successful create/update/delete (the parent refreshes its budget figures)
 */
export default function ExpensesPanel({ projectId, onChange }) {
  const { can } = useAuth()
  const fixedProjectId = Number(projectId) > 0 ? Number(projectId) : undefined
  // `filters` is what the controls show; `applied` is the last valid set, which is what gets queried.
  const [filters, setFilters] = useState({})
  const [applied, setApplied] = useState({})
  const [dialog, setDialog] = useState(null)

  const query = useMemo(() => (fixedProjectId ? { ...applied, project_id: fixedProjectId } : applied), [applied, fixedProjectId])
  const fetchExpenses = useCallback(() => expensesApi.list(query), [query])
  const { data, loading, error, reload } = useApiQuery(fetchExpenses)
  const projects = useProjectOptions()
  const rows = data?.items

  const changeFilters = (next) => {
    setFilters(next)
    if (!dateRangeError(next.date_from, next.date_to)) setApplied(next)
  }

  const canCreate = can('expenses:create')
  const canUpdate = can('expenses:update')
  const canDelete = can('expenses:delete')
  const empty = emptyText(hasActiveFilters(applied), canCreate, Boolean(fixedProjectId))

  const afterSave = () => {
    reload()
    onChange?.()
  }

  const renderActions = (expense) => (
    <>
      {canUpdate && (
        <IconButton aria-label={`Edit ${expense.description}`} onClick={() => setDialog({ mode: 'edit', expense })}>
          <EditIcon />
        </IconButton>
      )}
      {canDelete && (
        <IconButton aria-label={`Delete ${expense.description}`} color="error" onClick={() => setDialog({ mode: 'delete', expense })}>
          <DeleteIcon />
        </IconButton>
      )}
    </>
  )

  return (
    <Box>
      {canCreate && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ mode: 'create' })}>
            New expense
          </Button>
        </Box>
      )}
      {!fixedProjectId && projects.error && (
        <ErrorState error={projects.error} onRetry={projects.reload} title="Could not load the project list" />
      )}
      <FilterBar
        values={filters}
        onChange={changeFilters}
        filters={expenseFilters(fixedProjectId ? undefined : projects.options)}
        searchPlaceholder="Description"
      />
      <DateRangeFilter
        label="Expense date range"
        from={filters.date_from}
        to={filters.date_to}
        error={dateRangeError(filters.date_from, filters.date_to)}
        onChange={(name, value) => changeFilters(withFilter(filters, name, value))}
      />
      {rows?.length > 0 && <ExpenseTotal expenses={rows} />}
      <DataTable
        columns={buildColumns(!fixedProjectId)}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Could not load the expenses"
        refreshErrorTitle="Could not refresh the expenses"
        renderActions={canUpdate || canDelete ? renderActions : undefined}
        ariaLabel="Expenses"
        emptyTitle={empty.title}
        emptyMessage={empty.message}
      />
      <ExpenseDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSaved={afterSave}
        projectOptions={projects.options}
        fixedProjectId={fixedProjectId}
        fixedProjectName={rows?.[0]?.project_name}
        defaultProjectId={applied.project_id}
      />
    </Box>
  )
}

/** Total of the expenses currently listed (announced when the filters change it). */
function ExpenseTotal({ expenses }) {
  return (
    <Typography variant="body2" color="textSecondary" aria-live="polite" sx={{ textAlign: 'right', mb: 1 }}>
      Total of {countLabel(expenses.length, 'listed expense')}:{' '}
      <Box component="strong" sx={{ color: 'text.primary', fontSize: '1rem' }}>
        {formatCurrency(sumMoney(expenses.map((expense) => expense.amount)))}
      </Box>
    </Typography>
  )
}

import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import DataTable from '../../components/DataTable'
import PercentBar from '../../components/PercentBar'
import StatusChip from '../../components/StatusChip'
import { budgetColor, formatCurrency } from '../../utils/format'
import { sortLabel } from '../../utils/labels'
import { budgetUsedLabel } from '../projects/projectMetrics'
import { budgetedProjects, sortByBudgetUsed } from './budgetMetrics'
import ProjectLink from './ProjectLink'

const COLUMNS = [
  { field: 'name', header: 'Project', sortable: true, render: (project) => <ProjectLink id={project.id} name={project.name} /> },
  {
    field: 'status',
    header: 'Status',
    hideOnMobile: true,
    sortable: true,
    sortValue: (project) => sortLabel('project', project.status),
    render: (project) => <StatusChip kind="project" value={project.status} />,
  },
  { field: 'budget', header: 'Planned', align: 'right', sortable: true, render: (project) => formatCurrency(project.budget) },
  { field: 'budget_spent', header: 'Spent', align: 'right', sortable: true, render: (project) => formatCurrency(project.budget_spent) },
  {
    field: 'budget_remaining',
    header: 'Remaining',
    align: 'right',
    hideOnMobile: true,
    sortable: true,
    render: (project) => (
      <Box component="span" sx={project.budget_remaining < 0 ? { color: 'error.main', fontWeight: 600 } : undefined}>
        {formatCurrency(project.budget_remaining)}
      </Box>
    ),
  },
  {
    field: 'budget_used_percent',
    header: 'Used',
    // null means money was spent against a zero budget: the highest share used (as in the default order).
    sortable: true,
    sortValue: (project) => project.budget_used_percent ?? Infinity,
    render: (project) => (
      <PercentBar
        value={project.budget_used_percent}
        color={budgetColor(project.budget_used_percent)}
        label={budgetUsedLabel(project.budget_used_percent)}
        compact
      />
    ),
  },
  {
    field: 'over_budget',
    header: 'Budget status',
    sortable: true,
    sortValue: (project) => (project.over_budget ? 'Over budget' : 'Within budget'),
    render: (project) =>
      project.over_budget ? (
        <Chip size="small" color="error" label="Over budget" />
      ) : (
        <Chip size="small" color="success" variant="outlined" label="Within budget" />
      ),
  },
]

/** Planned vs consumed budget per project, highest share used first (cancelled projects left out). */
export default function BudgetByProjectTable({ projects, loading, error, onRetry }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={sortByBudgetUsed(budgetedProjects(projects))}
      loading={loading}
      error={error}
      onRetry={onRetry}
      // The summary cards above come from the same request, so the title speaks of the budget figures.
      errorTitle="Could not load the budget figures"
      refreshErrorTitle="Could not refresh the budget figures"
      ariaLabel="Planned vs consumed by project"
      emptyTitle="No projects to show"
      emptyMessage="Projects and their budgets will appear here once they are created."
    />
  )
}

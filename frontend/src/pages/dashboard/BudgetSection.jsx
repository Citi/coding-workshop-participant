import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import PercentBar from '../../components/PercentBar'
import { budgetColor } from '../../utils/format'
import { budgetUsedLabel } from '../projects/projectMetrics'
import { ItemHeader, RecordLink } from './DashboardBits'
import DashboardSection, { SectionList } from './DashboardSection'
import { remainingLabel, spentOfPlanned } from './dashboardUtils'
import { countLabel } from '../../utils/text'

/**
 * Planned vs consumed budget per project (budget_by_project: highest share used first, cancelled
 * projects excluded). totals: the dashboard's `budget` figures.
 */
export default function BudgetSection({ lines, totals = {} }) {
  const overBudget = totals.over_budget_projects || 0
  return (
    <DashboardSection
      title="Budget: planned vs consumed"
      description="Highest share of the budget used first. Cancelled projects are not included."
      viewAll={{ to: '/budget', label: 'View all project budgets', permission: 'expenses:read' }}
    >
      {overBudget > 0 && (
        <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 600 }}>
          {countLabel(overBudget, 'project')} over budget
        </Typography>
      )}
      <SectionList
        items={lines}
        getKey={(line) => line.project_id}
        label="Budget by project"
        emptyTitle="No budgets to show"
        emptyMessage="Project budgets show here once projects are created."
        renderItem={(line) => <BudgetLine line={line} />}
      />
    </DashboardSection>
  )
}

function BudgetLine({ line }) {
  const used = line.budget_used_percent
  return (
    <>
      <ItemHeader
        title={
          <RecordLink to={`/projects/${line.project_id}`} permission="projects:read">
            {line.project_name}
          </RecordLink>
        }
        aside={line.over_budget ? <Chip size="small" color="error" label="Over budget" /> : null}
      />
      <Box sx={{ mt: 1 }}>
        <PercentBar value={used} color={budgetColor(used)} label={budgetUsedLabel(used)} />
      </Box>
      <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
        {spentOfPlanned(line.budget_spent, line.budget)} spent ·{' '}
        <Box component="span" sx={line.over_budget ? { color: 'error.main', fontWeight: 600 } : undefined}>
          {remainingLabel(line.budget_remaining)}
        </Box>
      </Typography>
    </>
  )
}

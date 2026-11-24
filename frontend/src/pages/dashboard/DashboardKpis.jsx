import EventBusyIcon from '@mui/icons-material/EventBusy'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import GroupsIcon from '@mui/icons-material/Groups'
import PaymentsIcon from '@mui/icons-material/Payments'
import StarIcon from '@mui/icons-material/Star'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Grid from '@mui/material/Grid'
import StatCard from '../../components/StatCard'
import { formatPercent } from '../../utils/format'
import { completionPercent } from '../projects/projectMetrics'
import { budgetTone, riskSummary, riskTone, spentOfPlanned } from './dashboardUtils'
import { countLabel } from '../../utils/text'

const textColor = (tone) => (tone ? `${tone}.main` : undefined)
const alertTone = (count) => (count > 0 ? 'error' : undefined)

/** The headline numbers, one per business question; bad news is coloured (with the number in words too). */
function kpiCards({ projects = {}, deliverables = {}, resources = {}, budget = {} }) {
  const risk = riskSummary(projects.by_health)
  const riskColor = riskTone(risk)
  const budgetColor = budgetTone(budget.used_percent)
  const overAllocated = resources.over_allocated || 0
  const overdue = deliverables.overdue || 0
  const keyTotal = deliverables.key_total || 0
  const openDeliverables = (deliverables.total || 0) - (deliverables.completed || 0)
  return [
    {
      label: 'Active projects',
      value: projects.by_status?.active ?? 0,
      helper: `of ${countLabel(projects.total, 'project')}`,
      icon: <FolderOpenIcon color="primary" />,
    },
    {
      label: 'Projects at risk',
      value: risk.total,
      helper: risk.total ? `${risk.atRisk} at risk · ${risk.overdue} overdue` : 'All open projects are on track',
      color: textColor(riskColor),
      icon: <WarningAmberIcon color={riskColor || 'disabled'} />,
    },
    {
      label: 'Over-allocated',
      value: overAllocated,
      helper: `of ${countLabel(resources.total, 'team member')}`,
      color: textColor(alertTone(overAllocated)),
      icon: <GroupsIcon color={alertTone(overAllocated) || 'disabled'} />,
    },
    {
      label: 'Budget used',
      value: formatPercent(budget.used_percent ?? 0),
      helper: budget.total_planned > 0 ? spentOfPlanned(budget.total_spent, budget.total_planned) : 'No budget planned yet',
      color: textColor(budgetColor),
      icon: <PaymentsIcon color={budgetColor || 'primary'} />,
    },
    {
      label: 'Key deliverables',
      value: `${deliverables.key_completed || 0} of ${keyTotal}`,
      helper: keyTotal ? `${completionPercent(deliverables.key_completed, keyTotal)}% completed` : 'No key deliverables yet',
      icon: <StarIcon color="secondary" />,
    },
    {
      label: 'Overdue deliverables',
      value: overdue,
      helper: `${deliverables.blocked || 0} blocked · ${openDeliverables} open`,
      color: textColor(alertTone(overdue)),
      icon: <EventBusyIcon color={alertTone(overdue) || 'disabled'} />,
    },
  ]
}

/** KPI tiles: two per row on phones, three on tablets and laptops, six on wide screens. */
export default function DashboardKpis({ data }) {
  return (
    <Grid container spacing={2} component="section" aria-label="Key figures">
      {kpiCards(data).map((card) => (
        <Grid key={card.label} size={{ xs: 6, md: 4, xl: 2 }}>
          <StatCard {...card} />
        </Grid>
      ))}
    </Grid>
  )
}

import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import PaymentsIcon from '@mui/icons-material/Payments'
import SavingsIcon from '@mui/icons-material/Savings'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Grid from '@mui/material/Grid'
import StatCard from '../../components/StatCard'
import { formatCurrency, formatPercent } from '../../utils/format'
import { budgetSummary } from './budgetMetrics'
import { countLabel } from '../../utils/text'

const money = (value) => formatCurrency(value, { whole: true })

/** Portfolio KPIs: planned, spent, remaining and over-budget projects (cancelled projects excluded). */
export default function BudgetSummary({ projects }) {
  const summary = budgetSummary(projects)
  const overspent = summary.remaining < 0
  const cards = [
    {
      label: 'Planned budget',
      value: money(summary.totalPlanned),
      helper: `Across ${countLabel(summary.projectCount, 'project')} (cancelled excluded)`,
      icon: <AccountBalanceWalletIcon color="primary" />,
    },
    {
      label: 'Spent',
      value: money(summary.totalSpent),
      helper: summary.totalPlanned > 0 ? `${formatPercent(summary.usedPercent)} of the planned budget` : 'No budget planned yet',
      icon: <PaymentsIcon color="primary" />,
    },
    {
      label: 'Remaining',
      value: money(summary.remaining),
      helper: overspent ? 'Spending is above the planned budget' : 'Left to spend',
      color: overspent ? 'error.main' : undefined,
      icon: <SavingsIcon color={overspent ? 'error' : 'success'} />,
    },
    {
      label: 'Over-budget projects',
      value: summary.overBudgetCount,
      helper: summary.overBudgetCount ? 'Spent more than their planned budget' : 'All projects are within budget',
      color: summary.overBudgetCount ? 'error.main' : undefined,
      icon: <WarningAmberIcon color={summary.overBudgetCount ? 'error' : 'disabled'} />,
    },
  ]
  return (
    <Grid container spacing={2}>
      {cards.map((card) => (
        <Grid key={card.label} size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard {...card} />
        </Grid>
      ))}
    </Grid>
  )
}

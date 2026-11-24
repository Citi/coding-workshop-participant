import { Fragment } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DueDate from '../../components/DueDate'
import PercentBar from '../../components/PercentBar'
import { budgetColor, formatCurrency, formatDate, todayIso } from '../../utils/format'
import { labelFor } from '../../utils/labels'
import { budgetUsedLabel, completionPercent, elapsedPercent, isClosed, startsInLabel } from './projectMetrics'
import { countLabel } from '../../utils/text'

const HEALTH_SEVERITY = { on_track: 'success', at_risk: 'warning', overdue: 'error' }

/** One project at a glance: why its health is what it is, then progress, key deliverables, schedule and budget. */
export default function ProjectOverview({ project }) {
  return (
    <Stack spacing={2}>
      <HealthAlert project={project} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ProgressCard project={project} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <KeyDeliverablesCard project={project} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ScheduleCard project={project} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <BudgetCard project={project} />
        </Grid>
      </Grid>
    </Stack>
  )
}

function HealthAlert({ project }) {
  const { health } = project
  const reasons = project.health_reasons || []
  if (!health) {
    return <Alert severity="info">Health is not tracked for {labelFor('project', project.status).toLowerCase()} projects.</Alert>
  }
  return (
    <Alert severity={HEALTH_SEVERITY[health] || 'info'}>
      <AlertTitle>Health: {labelFor('health', health)}</AlertTitle>
      {reasons.length ? (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </Box>
      ) : (
        'No risks found: nothing is overdue or blocked, and progress is keeping pace with the schedule.'
      )}
    </Alert>
  )
}

function ProgressCard({ project }) {
  const total = project.deliverables_total
  const issues = [
    project.deliverables_overdue > 0 && `${project.deliverables_overdue} overdue`,
    project.deliverables_blocked > 0 && `${project.deliverables_blocked} blocked`,
  ].filter(Boolean)
  return (
    <OverviewCard title="Progress">
      <PercentBar value={project.progress_percent} />
      <Typography variant="body2" sx={{ mt: 1 }}>
        {total ? `${project.deliverables_completed} of ${countLabel(total, 'deliverable')} complete` : 'No deliverables yet'}
      </Typography>
      {issues.length > 0 && (
        <Typography variant="body2" color="warning" sx={{ fontWeight: 600 }}>
          {issues.join(' · ')}
        </Typography>
      )}
    </OverviewCard>
  )
}

function KeyDeliverablesCard({ project }) {
  const total = project.key_deliverables_total
  const completed = project.key_deliverables_completed
  return (
    <OverviewCard title="Key deliverables">
      {total ? (
        <>
          <Typography variant="h4" component="p" sx={{ fontWeight: 700 }}>
            {completed} of {total}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
            key deliverables completed
          </Typography>
          <PercentBar value={completionPercent(completed, total)} color="success" />
        </>
      ) : (
        <Typography variant="body2" color="textSecondary">
          No key deliverables yet. Mark the most important deliverables as key on the Deliverables tab.
        </Typography>
      )}
    </OverviewCard>
  )
}

function ScheduleCard({ project }) {
  const today = todayIso()
  const closed = isClosed(project.status)
  const startsIn = startsInLabel(project.start_date, today)
  return (
    <OverviewCard title="Schedule">
      <Facts
        items={[
          { label: 'Start date', value: formatDate(project.start_date) },
          { label: 'End date', value: <DueDate date={project.end_date} kind="end" today={today} done={closed} /> },
        ]}
      />
      {!closed && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="textSecondary">
            Time elapsed
          </Typography>
          <PercentBar value={elapsedPercent(project.start_date, project.end_date, today)} color="secondary" />
          {/* Once it has started, the end date above says how much time is left ("Ends in 3 weeks"). */}
          {startsIn && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {startsIn}
            </Typography>
          )}
        </Box>
      )}
    </OverviewCard>
  )
}

function BudgetCard({ project }) {
  const percent = project.budget_used_percent
  return (
    <OverviewCard title="Budget">
      <PercentBar value={percent} color={budgetColor(percent)} label={budgetUsedLabel(percent)} />
      <Facts
        items={[
          { label: 'Planned', value: formatCurrency(project.budget) },
          { label: 'Spent', value: formatCurrency(project.budget_spent) },
          {
            label: 'Remaining',
            value: formatCurrency(project.budget_remaining),
            color: project.budget_remaining < 0 ? 'error.main' : undefined,
          },
        ]}
      />
      {project.over_budget && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Over budget by {formatCurrency(-project.budget_remaining)}
        </Alert>
      )}
    </OverviewCard>
  )
}

function OverviewCard({ title, children }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Paper>
  )
}

/** Label/value pairs as a description list. */
function Facts({ items }) {
  return (
    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5, m: 0, mt: 1.5 }}>
      {items.map(({ label, value, color }) => (
        <Fragment key={label}>
          <Typography component="dt" variant="body2" color="textSecondary">
            {label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: 'right', fontWeight: 600, color }}>
            {value}
          </Typography>
        </Fragment>
      ))}
    </Box>
  )
}

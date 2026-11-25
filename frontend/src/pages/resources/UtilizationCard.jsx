import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import PercentBar from '../../components/PercentBar'
import { formatPercent } from '../../utils/format'
import { allocationColor, allocationSummary, FULL_TIME_PERCENT } from './resourceUtils'

/**
 * A person's utilization: total allocation across active projects, spare capacity, and a warning
 * explaining why they are over-allocated.
 */
export default function UtilizationCard({ resource }) {
  const total = resource.total_allocation_percent ?? 0
  const projects = resource.active_project_count ?? 0
  const overAllocated = Boolean(resource.is_over_allocated)
  const spare = FULL_TIME_PERCENT - total

  return (
    <Paper component="section" aria-labelledby="utilization-heading" sx={{ p: { xs: 2, md: 3 } }}>
      <Typography id="utilization-heading" variant="h6" component="h2" sx={{ mb: 2 }}>
        Utilization
      </Typography>
      {overAllocated && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Over-allocated</AlertTitle>
          {resource.full_name} is allocated {allocationSummary(resource)}, {formatPercent(-spare)} more than full time.
          Reduce or move one of the allocations below to balance their workload.
        </Alert>
      )}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Metric label="Total allocation" value={formatPercent(total)} color={overAllocated ? 'error.main' : undefined} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Metric label="Active projects" value={projects} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          {spare < 0 ? (
            <Metric label="Over capacity by" value={formatPercent(-spare)} color="error.main" />
          ) : (
            <Metric label="Available capacity" value={formatPercent(spare)} />
          )}
        </Grid>
      </Grid>
      <PercentBar value={total} color={allocationColor(overAllocated)} />
      <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
        {projects ? `Allocated ${allocationSummary(resource)}.` : 'Not allocated to any active project.'} Only allocations to
        active projects count towards the total.
      </Typography>
    </Paper>
  )
}

function Metric({ label, value, color = 'text.primary' }) {
  return (
    <Box>
      <Typography variant="body2" color="textSecondary">
        {label}
      </Typography>
      <Typography variant="h5" component="p" sx={{ fontWeight: 700, color }}>
        {value}
      </Typography>
    </Box>
  )
}

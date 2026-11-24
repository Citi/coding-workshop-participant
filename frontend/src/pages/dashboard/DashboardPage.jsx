import RefreshIcon from '@mui/icons-material/Refresh'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PageHeader from '../../components/PageHeader'
import { ErrorState, LoadingState } from '../../components/StateViews'
import { useApiQuery } from '../../hooks/useApiQuery'
import { dashboardApi } from '../../services/dashboardApi'
import BudgetSection from './BudgetSection'
import DashboardKpis from './DashboardKpis'
import { formatUpdatedAt, snapshotDate } from './dashboardUtils'
import { KeyDeliverablesSection, OverdueDeliverablesSection, UpcomingDeliverablesSection } from './DeliverableSections'
import OverAllocatedSection from './OverAllocatedSection'
import { ActiveProjectsSection, AtRiskProjectsSection, ProjectStatusSection } from './ProjectSections'

// Module-level, so the fetcher never changes and useApiQuery only runs it again on reload().
const fetchDashboard = () => dashboardApi.get()

/**
 * Portfolio overview from one GET /dashboard call: headline figures, then one panel per business
 * question. Every role may read it; it only links to other pages (no create/edit/delete here).
 */
export default function DashboardPage() {
  const { data, loading, error, reload } = useApiQuery(fetchDashboard)

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Project health, team allocation, key deliverables and budget at a glance"
        actions={<RefreshControl generatedAt={data?.generated_at} loading={loading} onRefresh={reload} />}
      />
      {data ? (
        <>
          {loading && <LinearProgress aria-label="Refreshing the dashboard" sx={{ mb: 2 }} />}
          {error && <ErrorState error={error} onRetry={reload} title="Could not refresh the dashboard" />}
          <DashboardContent data={data} />
        </>
      ) : (
        <FirstLoadState error={error} onRetry={reload} />
      )}
    </>
  )
}

/** Shown until the dashboard has loaded once. */
function FirstLoadState({ error, onRetry }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} title="Could not load the dashboard" />
  return <LoadingState label="Loading dashboard…" />
}

/** "Updated 2:05 PM" (announced to screen readers when it changes) and the Refresh button. */
function RefreshControl({ generatedAt, loading, onRefresh }) {
  const updatedAt = formatUpdatedAt(generatedAt)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Typography variant="body2" color="textSecondary" aria-live="polite">
        {updatedAt && (
          <>
            Updated <time dateTime={generatedAt}>{updatedAt}</time>
          </>
        )}
      </Typography>
      <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} disabled={loading}>
        Refresh
      </Button>
    </Box>
  )
}

function DashboardContent({ data }) {
  const today = snapshotDate(data.generated_at)
  return (
    <Stack spacing={3}>
      <DashboardKpis data={data} />
      <Grid container spacing={2}>
        <Panel>
          <AtRiskProjectsSection projects={data.at_risk_projects} />
        </Panel>
        <Panel>
          <ProjectStatusSection projects={data.projects} />
        </Panel>
        <Panel>
          <KeyDeliverablesSection deliverables={data.key_deliverables} totals={data.deliverables} today={today} />
        </Panel>
        <Panel>
          <OverAllocatedSection resources={data.over_allocated_resources} totals={data.resources} />
        </Panel>
        <Panel>
          <OverdueDeliverablesSection deliverables={data.overdue_deliverables} today={today} />
        </Panel>
        <Panel>
          <UpcomingDeliverablesSection deliverables={data.upcoming_deliverables} today={today} />
        </Panel>
        <Panel>
          <ActiveProjectsSection projects={data.active_projects} />
        </Panel>
        <Panel>
          <BudgetSection lines={data.budget_by_project} totals={data.budget} />
        </Panel>
      </Grid>
    </Stack>
  )
}

function Panel({ children }) {
  return <Grid size={{ xs: 12, md: 6 }}>{children}</Grid>
}

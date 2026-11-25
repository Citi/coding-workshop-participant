import { useState } from 'react'
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

/** Hidden from view, read by screen readers. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/**
 * "Updated 2:05 PM" and the Refresh button. Screen readers hear "Dashboard updated at 2:06 PM"
 * once a refresh has brought a new snapshot, from a polite message that stays empty until then:
 * the first load is not announced (nothing is on the page before it, and the loading status
 * already speaks for it). The message is not a role="status", so the page has none once loaded.
 */
function RefreshControl({ generatedAt, loading, onRefresh }) {
  const updatedAt = formatUpdatedAt(generatedAt)
  // The snapshot on screen, and what to announce about it ('' for the first one).
  const [shown, setShown] = useState({ generatedAt, announcement: '' })
  if (generatedAt !== shown.generatedAt) {
    // Adjusting state while rendering (React's documented alternative to an effect).
    setShown({ generatedAt, announcement: shown.generatedAt && updatedAt ? `Dashboard updated at ${updatedAt}` : '' })
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Typography variant="body2" color="textSecondary">
        {updatedAt && (
          <>
            Updated <time dateTime={generatedAt}>{updatedAt}</time>
          </>
        )}
      </Typography>
      <Box aria-live="polite" aria-atomic="true" sx={VISUALLY_HIDDEN}>
        {/* A new element for each snapshot: two refreshes in the same minute are both announced. */}
        {shown.announcement && <span key={shown.generatedAt}>{shown.announcement}</span>}
      </Box>
      <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} disabled={loading}>
        Refresh
      </Button>
    </Box>
  )
}

function DashboardContent({ data }) {
  // Due and end dates are worded against the API's "today", not the viewer's clock.
  const today = snapshotDate(data.generated_at)
  return (
    <Stack spacing={3}>
      <DashboardKpis data={data} />
      <Grid container spacing={2}>
        <Panel>
          <AtRiskProjectsSection projects={data.at_risk_projects} today={today} />
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
          <ActiveProjectsSection projects={data.active_projects} today={today} />
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

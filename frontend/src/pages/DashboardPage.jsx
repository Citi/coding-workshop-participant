import { Alert, Box, Button, CircularProgress, Grid, Stack } from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FolderIcon from '@mui/icons-material/Folder';
import GroupIcon from '@mui/icons-material/Group';
import PaymentsIcon from '@mui/icons-material/Payments';
import PageHeader from '../components/common/PageHeader';
import StatTile from '../components/dashboard/StatTile';
import AtRiskWidget from '../components/dashboard/AtRiskWidget';
import UtilizationWidget from '../components/dashboard/UtilizationWidget';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getDashboardSummary } from '../services/reportService';
import { ACTIONS, ROLE_LABELS } from '../utils/constants';
import { formatCompactCurrency } from '../utils/formatters';

/**
 * The landing screen.
 *
 * The counters come from /reports/summary, which an EMPLOYEE cannot call --
 * `generate_reports` is not in their matrix. Rather than let the request 403,
 * the page checks first and shows them a scoped view instead. Asking for data
 * you know will be refused is a poor experience even when handled.
 */
export default function DashboardPage() {
  const { user, role, can } = useAuth();
  const mayReport = Boolean(can(ACTIONS.GENERATE_REPORTS));

  const summary = useApi(getDashboardSummary, { immediate: mayReport });

  const counts = summary.data;

  return (
    <Box>
      <PageHeader
        title={`Welcome back, ${user?.fullName?.split(' ')[0] ?? 'there'}`}
        subtitle={`Signed in as ${ROLE_LABELS[role] ?? role}`}
      />

      {!mayReport && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Your role sees the projects and deliverables assigned to you. Organisation-wide
          reporting is available to managers and stakeholders.
        </Alert>
      )}

      {mayReport && summary.error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={summary.refresh}>
              Retry
            </Button>
          }
        >
          {summary.error.message}
        </Alert>
      )}

      {mayReport && summary.loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }} role="status">
          <CircularProgress aria-label="Loading dashboard" />
        </Box>
      )}

      {mayReport && counts && (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatTile
                label="Active projects"
                value={counts.projects.active}
                caption={`${counts.projects.total} in total`}
                icon={<FolderIcon />}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatTile
                label="At risk"
                value={counts.projects.atRisk}
                caption="need attention"
                icon={<AssignmentIcon />}
                color="warning"
                emphasis={counts.projects.atRisk > 0 ? 'error' : undefined}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatTile
                label="Overdue deliverables"
                value={counts.deliverables.overdue}
                caption={`of ${counts.deliverables.total}`}
                icon={<AssignmentIcon />}
                color="secondary"
                emphasis={counts.deliverables.overdue > 0 ? 'warning' : undefined}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatTile
                label="Over-allocated"
                value={counts.resources.overAllocated}
                caption={`of ${counts.resources.total} people`}
                icon={<GroupIcon />}
                color="info"
                emphasis={counts.resources.overAllocated > 0 ? 'error' : undefined}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <StatTile
                label="Planned budget"
                value={formatCompactCurrency(counts.budget.planned)}
                icon={<PaymentsIcon />}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <StatTile
                label="Consumed"
                value={formatCompactCurrency(counts.budget.consumed)}
                icon={<PaymentsIcon />}
                color="secondary"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <StatTile
                label="Variance"
                value={formatCompactCurrency(counts.budget.variance)}
                caption={counts.budget.variance < 0 ? 'over budget' : 'remaining'}
                icon={<PaymentsIcon />}
                color={counts.budget.variance < 0 ? 'error' : 'success'}
                emphasis={counts.budget.variance < 0 ? 'error' : 'success'}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <AtRiskWidget />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <UtilizationWidget />
            </Grid>
          </Grid>
        </Stack>
      )}
    </Box>
  );
}

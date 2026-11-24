import { Link as RouterLink } from 'react-router-dom';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ErrorState from '../components/ErrorState.jsx';
import KpiTile from '../components/KpiTile.jsx';
import MoneyText from '../components/MoneyText.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DepartmentBudgetChart from '../components/projects/DepartmentBudgetChart.jsx';
import ProjectStatusChart from '../components/projects/ProjectStatusChart.jsx';
import RecentActivityList from '../components/projects/RecentActivityList.jsx';
import RiskDistributionChart from '../components/projects/RiskDistributionChart.jsx';
import TopRisksList from '../components/projects/TopRisksList.jsx';
import { useAuth } from '../auth/useAuth.js';
import { PROJECT_STATUSES, STATUS_LABELS } from '../constants.js';
import useApi from '../hooks/useApi.js';
import { getDashboard } from '../services/analytics.js';
import { formatDate, formatNumber, formatPct, toNumber } from '../utils/format.js';

/**
 * Accent for the budget tile: overspend is an error, nearly spent is a warning.
 * @param {number|null} utilization - Portfolio utilization in percent.
 * @returns {'primary'|'warning'|'error'} Tile tone.
 */
function budgetTone(utilization) {
  if (utilization === null) {
    return 'primary';
  }
  if (utilization > 100) {
    return 'error';
  }
  return utilization >= 90 ? 'warning' : 'primary';
}

/**
 * Executive dashboard (route /): KPI tiles, projects by status, risk distribution, planned
 * versus spent by department, top risks linking to each project's Risk tab, and recent
 * activity for the roles that may read audit logs (ADMIN and PM; with an empty state until
 * something changes). LEAD and VIEWER do not see the activity card: the API sends them none.
 * @returns {JSX.Element} The page.
 */
export default function DashboardPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi((signal) => getDashboard({}, { signal }), []);
  const firstLoad = loading && !data;

  if (error && !data) {
    return (
      <>
        <PageHeader title="Executive Dashboard" subtitle="Portfolio status, risk, budget and capacity at a glance." />
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  const byStatus = data?.projects_by_status ?? {};
  const byRisk = data?.risk_by_level ?? {};
  const total = data?.total_projects ?? 0;
  const active = byStatus.ACTIVE ?? 0;
  const critical = byRisk.CRITICAL ?? 0;
  const high = byRisk.HIGH ?? 0;
  const overAllocated = data?.over_allocated_count ?? 0;
  const budget = data?.budget ?? {};
  const utilization = toNumber(budget.utilization_pct);
  const recent = data?.recent_activity ?? [];
  const showActivity = can('read', 'auditLogs');
  const otherStatuses = PROJECT_STATUSES.filter((status) => status !== 'ACTIVE' && (byStatus[status] ?? 0) > 0)
    .map((status) => `${formatNumber(byStatus[status])} ${STATUS_LABELS[status].toLowerCase()}`)
    .join(' · ');

  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        subtitle={
          data?.as_of
            ? `Portfolio status, risk, budget and capacity as of ${formatDate(data.as_of)}.`
            : 'Portfolio status, risk, budget and capacity at a glance.'
        }
      />
      {error && data ? <ErrorState error={error} onRetry={reload} title="Could not refresh the dashboard" /> : null}

      <Grid container spacing={2} sx={{ mb: 2 }} component="section" aria-label="Key figures">
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Projects"
            value={formatNumber(total)}
            hint={
              total === 0 ? (
                'No projects yet'
              ) : (
                <>
                  <Link component={RouterLink} to="/projects?status=ACTIVE">
                    {`${formatNumber(active)} active`}
                  </Link>
                  {otherStatuses ? ` · ${otherStatuses}` : ''}
                </>
              )
            }
            icon={<FolderOutlinedIcon />}
            tone="primary"
            loading={firstLoad}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="High or critical risk"
            value={formatNumber(critical + high)}
            hint={
              <Link component={RouterLink} to="/risk">
                {`${formatNumber(critical)} critical · ${formatNumber(high)} high`}
              </Link>
            }
            icon={<ReportProblemOutlinedIcon />}
            tone={critical + high > 0 ? 'error' : 'success'}
            loading={firstLoad}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Over-allocated people"
            value={formatNumber(overAllocated)}
            hint={
              <Link component={RouterLink} to="/capacity">
                See capacity conflicts
              </Link>
            }
            icon={<GroupsOutlinedIcon />}
            tone={overAllocated > 0 ? 'warning' : 'success'}
            loading={firstLoad}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Budget spent"
            value={<MoneyText value={budget.spent_total} compact sx={{ fontVariantNumeric: 'normal' }} />}
            hint={
              <>
                {formatPct(utilization)} of <MoneyText value={budget.planned_total} compact /> planned ·{' '}
                <MoneyText value={budget.remaining_total} compact highlightNegative /> left
              </>
            }
            icon={<AccountBalanceWalletOutlinedIcon />}
            tone={budgetTone(utilization)}
            loading={firstLoad}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ProjectStatusChart countsByStatus={byStatus} loading={firstLoad} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <RiskDistributionChart countsByLevel={byRisk} loading={firstLoad} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <DepartmentBudgetChart departments={data?.departments ?? []} loading={firstLoad} />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <TopRisksList risks={data?.top_risks ?? []} loading={firstLoad} />
        </Grid>
        {showActivity ? (
          <Grid size={{ xs: 12 }}>
            <RecentActivityList entries={recent} loading={firstLoad} />
          </Grid>
        ) : null}
      </Grid>
    </>
  );
}

/** Takes no props. */
DashboardPage.propTypes = {};

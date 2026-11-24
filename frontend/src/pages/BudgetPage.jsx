import { Suspense } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import DataTable from '../components/DataTable.jsx';
import ErrorState from '../components/ErrorState.jsx';
import KpiTile from '../components/KpiTile.jsx';
import MoneyText from '../components/MoneyText.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import DivergenceText from '../components/portfolio/DivergenceText.jsx';
import { divergenceOf } from '../components/portfolio/budgetUtils.js';
import useApi from '../hooks/useApi.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { getBudgetAnalytics } from '../services/analytics.js';
import { formatDate, formatPct, toNumber } from '../utils/format.js';
import { lazyPage } from '../utils/lazyPage.js';

// The charts pull in @mui/x-charts; load them only once the numbers have arrived. A failed
// download (for example after a redeploy) reaches ErrorBoundary, which offers a page reload.
const BudgetCharts = lazyPage(() => import('../components/portfolio/BudgetCharts.jsx'));

const NO_ROWS = Object.freeze([]);

function remainingCell(remaining) {
  const negative = (toNumber(remaining) ?? 0) < 0;
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <MoneyText value={remaining} highlightNegative />
      {negative ? (
        <Typography component="span" variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
          Over budget
        </Typography>
      ) : null}
    </Box>
  );
}

function ProjectLink({ row }) {
  return (
    <Link component={RouterLink} to={`/projects/${row.project_id}?tab=budget`} sx={{ fontWeight: 600 }}>
      {row.project_name}
    </Link>
  );
}

ProjectLink.propTypes = {
  row: PropTypes.shape({ project_id: PropTypes.number.isRequired, project_name: PropTypes.string.isRequired })
    .isRequired,
};

/** Money and percentage columns shared by the phone and wide-screen layouts. */
const PROJECT_FIGURE_COLUMNS = [
  { field: 'planned_budget', header: 'Planned', align: 'right', render: (row) => <MoneyText value={row.planned_budget} /> },
  { field: 'actual_spend', header: 'Spent', align: 'right', render: (row) => <MoneyText value={row.actual_spend} /> },
  { field: 'remaining', header: 'Remaining', align: 'right', render: (row) => remainingCell(row.remaining) },
  { field: 'utilization_pct', header: 'Budget used', align: 'right', render: (row) => formatPct(row.utilization_pct) },
  { field: 'completion_pct', header: 'Completed', align: 'right', render: (row) => formatPct(row.completion_pct) },
  {
    field: 'divergence_pp',
    header: 'Spend vs progress',
    width: 180,
    render: (row) => <DivergenceText value={row.divergence_pp} />,
  },
];

/** Wide screens: department and status sit under the project name to leave room for the figures. */
const PROJECT_COLUMNS = [
  {
    field: 'project_name',
    header: 'Project',
    primary: true,
    render: (row) => (
      <Box component="span" sx={{ display: 'block' }}>
        <ProjectLink row={row} />
        <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <StatusChip status={row.status} />
          <Typography component="span" variant="body2" color="text.secondary">
            {row.department_name}
          </Typography>
        </Box>
      </Box>
    ),
  },
  ...PROJECT_FIGURE_COLUMNS,
];

/** Phones: one card per project with a labelled line per field. */
const MOBILE_PROJECT_COLUMNS = [
  { field: 'project_name', header: 'Project', primary: true, render: (row) => <ProjectLink row={row} /> },
  { field: 'department_name', header: 'Department' },
  { field: 'status', header: 'Status', render: (row) => <StatusChip status={row.status} /> },
  ...PROJECT_FIGURE_COLUMNS,
];

const DEPARTMENT_COLUMNS = [
  { field: 'department_name', header: 'Department', primary: true },
  { field: 'project_count', header: 'Projects', align: 'right' },
  { field: 'planned_budget', header: 'Planned', align: 'right', render: (row) => <MoneyText value={row.planned_budget} /> },
  { field: 'actual_spend', header: 'Spent', align: 'right', render: (row) => <MoneyText value={row.actual_spend} /> },
  { field: 'remaining', header: 'Remaining', align: 'right', render: (row) => remainingCell(row.remaining) },
  { field: 'utilization_pct', header: 'Budget used', align: 'right', render: (row) => formatPct(row.utilization_pct) },
  {
    field: 'completion_pct',
    header: 'Completed',
    align: 'right',
    render: (row) => formatPct(row.completion_pct),
  },
  {
    field: 'divergence',
    header: 'Spend vs progress',
    render: (row) => <DivergenceText value={divergenceOf(row.utilization_pct, row.completion_pct)} />,
  },
];

function ChartsPlaceholder() {
  return (
    <Grid container spacing={2} sx={{ mb: 3 }} aria-hidden="true">
      {[0, 1].map((key) => (
        <Grid key={key} size={{ xs: 12, lg: 6 }}>
          <Skeleton variant="rounded" height={340} />
        </Grid>
      ))}
    </Grid>
  );
}

/** Takes no props. */
ChartsPlaceholder.propTypes = {};

/**
 * Budget analytics (route /budget), answering spec question 7: how much budget is consumed
 * versus planned, per project and per department. Portfolio totals, two charts (planned vs
 * spent by department; budget used vs work completed per project) and the full numbers in
 * two tables, with the spend-versus-progress divergence stated in points and in words.
 * @returns {JSX.Element} The page.
 */
export default function BudgetPage() {
  const isMobile = useIsMobile();
  const { data, loading, error, reload } = useApi((signal) => getBudgetAnalytics({}, { signal }), []);
  const projects = data?.projects ?? NO_ROWS;
  const departments = data?.departments ?? NO_ROWS;
  const totals = data?.totals;
  const projectCounts = projects.reduce((counts, project) => {
    counts.set(project.department_id, (counts.get(project.department_id) ?? 0) + 1);
    return counts;
  }, new Map());
  const departmentRows = departments.map((department) => ({
    ...department,
    project_count: projectCounts.get(department.department_id) ?? 0,
  }));
  const overBudget = projects.filter((project) => (project.utilization_pct ?? 0) > 100);
  const firstLoad = loading && !data;

  return (
    <>
      <PageHeader
        title="Budget Analytics"
        subtitle={
          data?.as_of
            ? `Planned versus spent, and spend versus progress, per project and per department, as of ${formatDate(data.as_of)}.`
            : 'Planned versus spent, and spend versus progress, per project and per department.'
        }
      />

      {error && !data ? <ErrorState error={error} onRetry={reload} /> : null}

      {!error || data ? (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <KpiTile
                label="Planned budget"
                value={<MoneyText value={totals?.planned_budget} />}
                hint="All projects in the portfolio"
                icon={<AccountBalanceWalletOutlinedIcon />}
                tone="primary"
                loading={firstLoad}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <KpiTile
                label="Spent to date"
                value={<MoneyText value={totals?.actual_spend} />}
                hint="Sum of every budget entry"
                icon={<PaymentsOutlinedIcon />}
                loading={firstLoad}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <KpiTile
                label="Remaining"
                value={<MoneyText value={totals?.remaining} highlightNegative />}
                hint="Planned minus spent"
                icon={<SavingsOutlinedIcon />}
                tone={(toNumber(totals?.remaining) ?? 0) < 0 ? 'error' : 'success'}
                loading={firstLoad}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <KpiTile
                label="Budget used"
                value={formatPct(totals?.utilization_pct)}
                hint="Share of the planned budget spent"
                icon={<PercentOutlinedIcon />}
                loading={firstLoad}
              />
            </Grid>
          </Grid>

          {overBudget.length > 0 ? (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <AlertTitle>
                {overBudget.length === 1 ? '1 project is over budget' : `${overBudget.length} projects are over budget`}
              </AlertTitle>
              {overBudget
                .map((project) => `${project.project_name}: ${formatPct(project.utilization_pct)} of plan spent`)
                .join('; ')}
              .
            </Alert>
          ) : null}

          {data ? (
            <Suspense fallback={<ChartsPlaceholder />}>
              <BudgetCharts departments={departments} projects={projects} />
            </Suspense>
          ) : (
            <ChartsPlaceholder />
          )}

          <Box component="section" aria-labelledby="budget-projects-heading" sx={{ mb: 4 }}>
            <Typography id="budget-projects-heading" variant="h5" component="h2" sx={{ fontWeight: 600, mb: 1.5 }}>
              Projects
            </Typography>
            <DataTable
              columns={isMobile ? MOBILE_PROJECT_COLUMNS : PROJECT_COLUMNS}
              rows={projects}
              getRowId={(row) => row.project_id}
              loading={loading}
              ariaLabel="Budget by project"
              emptyTitle="No projects yet"
              emptyMessage="Create a project with a planned budget to see it here."
            />
          </Box>

          <Box component="section" aria-labelledby="budget-departments-heading">
            <Typography id="budget-departments-heading" variant="h5" component="h2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Departments
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Planned and spent are summed over each department’s projects; completion is weighted by planned budget.
            </Typography>
            <DataTable
              columns={DEPARTMENT_COLUMNS}
              rows={departmentRows}
              getRowId={(row) => row.department_id}
              loading={loading}
              ariaLabel="Budget by department"
              emptyTitle="No departments with projects"
            />
          </Box>
        </>
      ) : null}
    </>
  );
}

/** Takes no props. */
BudgetPage.propTypes = {};

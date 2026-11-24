import { useId } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { SERIES_COLORS, shortProjectName } from './budgetUtils.js';
import EmptyState from '../EmptyState.jsx';
import { formatMoney, formatPct, toNumber } from '../../utils/format.js';

/** Height of one category band; bars stay thin (two bars of about 11px each). */
const BAND_HEIGHT = 52;
/** Room for the legend and the value axis. */
const CHART_CHROME = 96;
const CATEGORY_AXIS_WIDTH = 136;

function chartHeight(categories) {
  return Math.max(220, categories * BAND_HEIGHT + CHART_CHROME);
}

const moneyTick = (value) => formatMoney(value, { compact: true });
const moneyValue = (value) => formatMoney(value);
const percentTick = (value) => `${value}%`;
const percentValue = (value) => formatPct(value);

const bandAxis = (dataKey) => ({
  scaleType: 'band',
  dataKey,
  width: CATEGORY_AXIS_WIDTH,
  categoryGapRatio: 0.45,
  barGapRatio: 0.15,
});

function ChartCard({ title, description, children }) {
  const titleId = useId();
  return (
    <Paper variant="outlined" component="section" aria-labelledby={titleId} sx={{ p: 2, height: '100%' }}>
      <Typography id={titleId} variant="h6" component="h3">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {description}
      </Typography>
      <Box role="img" aria-label={`${title}. ${description} The values are listed in the tables below.`}>
        {children}
      </Box>
    </Paper>
  );
}

ChartCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

/**
 * The two budget charts (spec 12.3 /budget): planned versus spent per department, and budget
 * used versus work completed per project. Horizontal bars with thin marks, a legend, and a
 * tooltip per category; every value is also in the page's tables. Loaded on demand so
 * @mui/x-charts only downloads when the data is there.
 * @param {object} props - Component props.
 * @param {object[]} props.departments - `departments` of `GET /analytics/budget`.
 * @param {object[]} props.projects - `projects` of `GET /analytics/budget`.
 * @returns {JSX.Element} Both charts side by side (stacked on small screens).
 */
export default function BudgetCharts({ departments, projects }) {
  const departmentData = departments.map((department) => ({
    name: department.department_name,
    planned: toNumber(department.planned_budget) ?? 0,
    spent: toNumber(department.actual_spend) ?? 0,
  }));
  const projectData = projects.map((project) => ({
    name: shortProjectName(project.project_name),
    utilization: project.utilization_pct,
    completion: project.completion_pct,
  }));
  const highestPercent = projectData.reduce(
    (highest, row) => Math.max(highest, row.utilization ?? 0, row.completion ?? 0),
    100,
  );

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ChartCard
          title="Planned vs spent by department"
          description="Planned budget and actual spend, summed over each department's projects."
        >
          {departmentData.length === 0 ? (
            <EmptyState title="No departments with projects" />
          ) : (
            <BarChart
              dataset={departmentData}
              layout="horizontal"
              height={chartHeight(departmentData.length)}
              yAxis={[bandAxis('name')]}
              xAxis={[{ min: 0, valueFormatter: moneyTick }]}
              series={[
                { dataKey: 'planned', label: 'Planned', color: SERIES_COLORS.plan, valueFormatter: moneyValue },
                { dataKey: 'spent', label: 'Spent', color: SERIES_COLORS.spend, valueFormatter: moneyValue },
              ]}
              borderRadius={4}
              grid={{ vertical: true }}
            />
          )}
        </ChartCard>
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ChartCard
          title="Budget used vs work completed"
          description="Share of the planned budget spent next to the share of work done, per project."
        >
          {projectData.length === 0 ? (
            <EmptyState title="No projects yet" />
          ) : (
            <BarChart
              dataset={projectData}
              layout="horizontal"
              height={chartHeight(projectData.length)}
              yAxis={[bandAxis('name')]}
              xAxis={[{ min: 0, max: Math.ceil(highestPercent / 10) * 10, valueFormatter: percentTick }]}
              series={[
                { dataKey: 'utilization', label: 'Budget used', color: SERIES_COLORS.spend, valueFormatter: percentValue },
                { dataKey: 'completion', label: 'Work completed', color: SERIES_COLORS.plan, valueFormatter: percentValue },
              ]}
              borderRadius={4}
              grid={{ vertical: true }}
            />
          )}
        </ChartCard>
      </Grid>
    </Grid>
  );
}

BudgetCharts.propTypes = {
  departments: PropTypes.arrayOf(
    PropTypes.shape({
      department_id: PropTypes.number,
      department_name: PropTypes.string.isRequired,
      planned_budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      actual_spend: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    }),
  ).isRequired,
  projects: PropTypes.arrayOf(
    PropTypes.shape({
      project_id: PropTypes.number,
      project_name: PropTypes.string.isRequired,
      utilization_pct: PropTypes.number,
      completion_pct: PropTypes.number,
    }),
  ).isRequired,
};

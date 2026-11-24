import PropTypes from 'prop-types';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import ChartCard from './ChartCard.jsx';
import { BAR_RADIUS, PLANNED_BUDGET_COLOR, axisMaxWithHeadroom, tickLabelStyle } from './chartTheme.js';
import { roundOneDecimal } from './projectUtils.js';
import MoneyText from '../MoneyText.jsx';
import { formatMoney, formatPct, toNumber } from '../../utils/format.js';

const ROW_HEIGHT = 52;
const AXIS_AND_LEGEND_HEIGHT = 80;

/**
 * Spend as a percentage of plan for one department, or null without a plan.
 * @param {number|null} planned - Planned budget.
 * @param {number|null} spent - Actual spend.
 * @returns {number|null} Utilization with one decimal.
 */
function utilization(planned, spent) {
  if (!planned) {
    return null;
  }
  return roundOneDecimal(((spent ?? 0) / planned) * 100);
}

/**
 * Dashboard chart: planned budget against actual spend per department (spec 1, question 7).
 * Two series on one money axis, largest plan first, with a legend and a table view.
 * @param {object} props - Component props.
 * @param {Array<{department_id: number, department_name: string, planned_budget: string,
 *   actual_spend: string}>} [props.departments] - `departments` from the dashboard API.
 * @param {boolean} [props.loading] - Show a skeleton.
 * @returns {JSX.Element} The chart card.
 */
export default function DepartmentBudgetChart({ departments = [], loading = false }) {
  const theme = useTheme();
  const rows = departments
    .map((department) => {
      const planned = toNumber(department.planned_budget) ?? 0;
      const spent = toNumber(department.actual_spend) ?? 0;
      return {
        id: department.department_id,
        name: department.department_name,
        plannedRaw: department.planned_budget,
        spentRaw: department.actual_spend,
        planned,
        spent,
        utilization: utilization(planned, spent),
      };
    })
    .sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  const height = Math.max(220, rows.length * ROW_HEIGHT + AXIS_AND_LEGEND_HEIGHT);
  const money = (value) => formatMoney(value, { compact: true });
  const summary = `Planned versus spent by department: ${rows
    .map((row) => `${row.name} planned ${formatMoney(row.planned)}, spent ${formatMoney(row.spent)}`)
    .join('; ')}.`;

  return (
    <ChartCard
      title="Planned vs spent by department"
      subtitle="Budget totals of each department's projects"
      summary={summary}
      loading={loading}
      empty={!loading && rows.length === 0}
      emptyMessage="Departments appear here once their projects have budgets."
      height={height}
      table={{
        columns: [
          { key: 'name', header: 'Department' },
          { key: 'planned', header: 'Planned', align: 'right', render: (row) => <MoneyText value={row.plannedRaw} /> },
          { key: 'spent', header: 'Spent', align: 'right', render: (row) => <MoneyText value={row.spentRaw} /> },
          { key: 'utilization', header: 'Used', align: 'right', render: (row) => formatPct(row.utilization) },
        ],
        rows,
      }}
    >
      <BarChart
        layout="horizontal"
        height={height}
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        borderRadius={BAR_RADIUS}
        grid={{ vertical: true }}
        slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'top', horizontal: 'start' } } }}
        yAxis={[
          {
            scaleType: 'band',
            data: rows.map((row) => row.name),
            width: 116,
            categoryGapRatio: 0.3,
            barGapRatio: 0.15,
            disableTicks: true,
            tickLabelStyle: tickLabelStyle(theme),
          },
        ]}
        xAxis={[
          {
            min: 0,
            max: axisMaxWithHeadroom(rows.flatMap((row) => [row.planned, row.spent])) / 1.1,
            valueFormatter: money,
            tickNumber: 4,
            tickLabelStyle: tickLabelStyle(theme),
          },
        ]}
        series={[
          {
            id: 'planned',
            data: rows.map((row) => row.planned),
            label: 'Planned',
            color: PLANNED_BUDGET_COLOR,
            valueFormatter: (value) => formatMoney(value),
          },
          {
            id: 'spent',
            data: rows.map((row) => row.spent),
            label: 'Spent',
            color: theme.palette.primary.main,
            valueFormatter: (value) => formatMoney(value),
          },
        ]}
      />
    </ChartCard>
  );
}

DepartmentBudgetChart.propTypes = {
  departments: PropTypes.arrayOf(
    PropTypes.shape({
      department_id: PropTypes.number.isRequired,
      department_name: PropTypes.string.isRequired,
      planned_budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      actual_spend: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    }),
  ),
  loading: PropTypes.bool,
};


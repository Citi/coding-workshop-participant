import PropTypes from 'prop-types';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import ChartCard from './ChartCard.jsx';
import { BAND_GAP_RATIO, BAR_RADIUS, axisMaxWithHeadroom, tickLabelStyle } from './chartTheme.js';
import StatusChip from '../StatusChip.jsx';
import { PROJECT_STATUSES, STATUS_LABELS } from '../../constants.js';
import { formatNumber } from '../../utils/format.js';

const CHART_HEIGHT = 230;

/**
 * Dashboard chart: how many projects are in each status (spec 1, question 1). One series in
 * one colour, statuses in their lifecycle order, counts printed at the bar ends.
 * @param {object} props - Component props.
 * @param {Record<string, number>} [props.countsByStatus] - `projects_by_status` from the dashboard API.
 * @param {boolean} [props.loading] - Show a skeleton.
 * @returns {JSX.Element} The chart card.
 */
export default function ProjectStatusChart({ countsByStatus = {}, loading = false }) {
  const theme = useTheme();
  const rows = PROJECT_STATUSES.map((status) => ({
    id: status,
    status,
    label: STATUS_LABELS[status],
    count: Number(countsByStatus[status] ?? 0),
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const counts = rows.map((row) => row.count);
  const summary = `Projects by status: ${rows.map((row) => `${row.label} ${row.count}`).join(', ')}.`;

  return (
    <ChartCard
      title="Projects by status"
      subtitle={`${formatNumber(total)} project${total === 1 ? '' : 's'} in the portfolio`}
      summary={summary}
      loading={loading}
      empty={!loading && total === 0}
      emptyMessage="Create a project to see the status breakdown."
      height={CHART_HEIGHT}
      table={{
        columns: [
          { key: 'status', header: 'Status', render: (row) => <StatusChip status={row.status} /> },
          { key: 'count', header: 'Projects', align: 'right' },
        ],
        rows,
      }}
    >
      <BarChart
        layout="horizontal"
        height={CHART_HEIGHT}
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        hideLegend
        borderRadius={BAR_RADIUS}
        grid={{ vertical: true }}
        yAxis={[
          {
            scaleType: 'band',
            data: rows.map((row) => row.label),
            width: 84,
            categoryGapRatio: BAND_GAP_RATIO,
            disableTicks: true,
            tickLabelStyle: tickLabelStyle(theme),
          },
        ]}
        xAxis={[
          {
            min: 0,
            max: axisMaxWithHeadroom(counts),
            tickMinStep: 1,
            valueFormatter: (value) => formatNumber(value),
            tickLabelStyle: tickLabelStyle(theme),
          },
        ]}
        series={[
          {
            data: counts,
            label: 'Projects',
            color: theme.palette.primary.main,
            valueFormatter: (value) => `${formatNumber(value)} project${value === 1 ? '' : 's'}`,
            barLabel: (item) => (item.value ? formatNumber(item.value) : null),
            barLabelPlacement: 'outside',
          },
        ]}
      />
    </ChartCard>
  );
}

ProjectStatusChart.propTypes = {
  countsByStatus: PropTypes.objectOf(PropTypes.number),
  loading: PropTypes.bool,
};

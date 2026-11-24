import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { BAR_RADIUS, tickLabelStyle } from './chartTheme.js';
import { formatPct, toNumber } from '../../utils/format.js';

const CHART_HEIGHT = 240;

/**
 * Two bars side by side (spec 12.4, Overview tab): the share of the planned budget consumed
 * and the share of deliverable work completed, on one 0-100% axis (extended when spending
 * passes the plan). Values are printed on the bars and repeated in the accessible name.
 * @param {object} props - Component props.
 * @param {number|null} [props.utilizationPct] - Budget consumed in percent; null without a plan.
 * @param {number|null} [props.completionPct] - Mean deliverable completion in percent.
 * @returns {JSX.Element} The chart.
 */
export default function BudgetProgressChart({ utilizationPct = null, completionPct = 0 }) {
  const theme = useTheme();
  const utilization = toNumber(utilizationPct);
  const completion = toNumber(completionPct) ?? 0;
  const top = Math.max(100, utilization ?? 0, completion);
  const axisMax = Math.ceil((top * 1.12) / 10) * 10;
  const summary = `Budget consumed ${utilization === null ? 'not available (no planned budget)' : formatPct(utilization)}; completion ${formatPct(completion)}.`;

  return (
    <Box role="figure" aria-label={summary} sx={{ height: CHART_HEIGHT, minWidth: 0 }}>
      <BarChart
        height={CHART_HEIGHT}
        margin={{ top: 16, right: 8, bottom: 8, left: 8 }}
        hideLegend
        borderRadius={BAR_RADIUS}
        grid={{ horizontal: true }}
        xAxis={[
          {
            scaleType: 'band',
            data: ['Budget consumed', 'Completion'],
            categoryGapRatio: 0.7,
            disableTicks: true,
            tickLabelStyle: { ...tickLabelStyle(theme), fontSize: 13 },
          },
        ]}
        yAxis={[
          {
            min: 0,
            max: axisMax,
            width: 48,
            valueFormatter: (value) => `${value}%`,
            tickLabelStyle: tickLabelStyle(theme),
          },
        ]}
        series={[
          {
            data: [utilization, completion],
            label: 'Percent',
            color: theme.palette.primary.main,
            valueFormatter: (value) => (value === null ? 'No planned budget' : formatPct(value)),
            barLabel: (item) => (item.value === null || item.value === undefined ? null : formatPct(item.value)),
            barLabelPlacement: 'outside',
          },
        ]}
      />
    </Box>
  );
}

BudgetProgressChart.propTypes = {
  utilizationPct: PropTypes.number,
  completionPct: PropTypes.number,
};

import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { BAR_RADIUS, tickLabelStyle } from './chartTheme.js';
import { factorChartRows } from './projectUtils.js';
import { useElementWidth } from './useElementWidth.js';

/** Height of one factor's band in pixels. */
const ROW_HEIGHT = 34;

/** Width kept for the factor names, enough for "Resource over-allocation". */
const NAME_WIDTH = 168;

/** Chart margins in pixels. */
const MARGIN = Object.freeze({ top: 4, right: 4, bottom: 4, left: 0 });

/**
 * Pixels a "points / max" label needs after the end of a bar: bold 12px text, the chart's 4px
 * offset, and spare room for fonts that render wider.
 */
const LABEL_SPACE = 58;

/** Axis room, as a multiple of the largest maximum, used until the chart's width is known. */
const DEFAULT_ROOM = 1.6;

/**
 * Axis maximum that leaves LABEL_SPACE pixels after the longest bar. The bar plot (labels
 * included) is clipped to the plotting area, so the room is worked out from the chart's width.
 * @param {number} largestMax - Largest factor maximum, in points.
 * @param {number} chartWidth - Rendered width of the chart in pixels (0 when not measured yet).
 * @returns {number} Axis maximum in points.
 */
function axisMaxFor(largestMax, chartWidth) {
  const plotWidth = chartWidth - NAME_WIDTH - MARGIN.left - MARGIN.right;
  if (chartWidth <= 0) {
    return largestMax * DEFAULT_ROOM;
  }
  if (plotWidth <= LABEL_SPACE * 1.5) {
    return largestMax * 3;
  }
  return (largestMax * plotWidth) / (plotWidth - LABEL_SPACE);
}

const factorShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  points: PropTypes.number.isRequired,
  max_points: PropTypes.number.isRequired,
  detail: PropTypes.string,
});

/**
 * The risk factors (spec 9.4 and 12.4) as one horizontal @mui/x-charts bar chart: a bar per
 * factor filled to its points, on a light track as long as the factor's maximum, with
 * "points / max" printed after it. Bars are on one points axis, so their filled lengths add up
 * to the score. The fill colour grows with the share of the maximum, but the printed numbers,
 * the chart's accessible name and the detail list under it carry every value in text.
 * @param {object} props - Component props.
 * @param {object[]} props.factors - RiskFactorOut items in the server's order.
 * @param {string} [props.ariaLabel] - Name of the chart, used in its accessible summary.
 * @returns {JSX.Element} The chart and the per-factor details.
 */
export default function RiskFactorBars({ factors, ariaLabel = 'Risk factors' }) {
  const theme = useTheme();
  const [chartRef, chartWidth] = useElementWidth();
  const rows = factorChartRows(factors);

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No risk factors were returned.
      </Typography>
    );
  }

  const toneColors = {
    none: theme.palette.grey[400],
    info: theme.palette.primary.main,
    warning: theme.palette.warning.main,
    error: theme.palette.error.main,
  };
  const height = rows.length * ROW_HEIGHT + 8;
  const axisMax = axisMaxFor(Math.max(1, ...rows.map((row) => row.max)), chartWidth);
  const summary = `${ariaLabel}: ${rows.map((row) => `${row.label} ${row.points} of ${row.max} points`).join('; ')}.`;

  return (
    <>
      <Box ref={chartRef} role="figure" aria-label={summary} sx={{ height, minWidth: 0 }}>
        <BarChart
          layout="horizontal"
          height={height}
          margin={MARGIN}
          hideLegend
          borderRadius={BAR_RADIUS}
          slotProps={{
            tooltip: { trigger: 'none' },
            barLabel: { style: { fontSize: 12, fontWeight: 700, fill: theme.palette.text.primary } },
          }}
          yAxis={[
            {
              scaleType: 'band',
              data: rows.map((row) => row.label),
              width: NAME_WIDTH,
              categoryGapRatio: 0.5,
              disableTicks: true,
              disableLine: true,
              tickLabelStyle: { ...tickLabelStyle(theme), fontSize: 13, fill: theme.palette.text.primary },
            },
          ]}
          xAxis={[{ min: 0, max: axisMax, position: 'none' }]}
          series={[
            {
              id: 'points',
              label: 'Points',
              stack: 'factor',
              data: rows.map((row) => row.filled),
              colorGetter: ({ dataIndex }) => toneColors[rows[dataIndex]?.tone ?? 'none'],
              barLabel: (item) => (rows[item.dataIndex]?.labelOn === 'points' ? rows[item.dataIndex].text : null),
              barLabelPlacement: 'outside',
            },
            {
              id: 'headroom',
              label: 'Points below the maximum',
              stack: 'factor',
              data: rows.map((row) => row.headroom),
              color: theme.palette.grey[200],
              barLabel: (item) => (rows[item.dataIndex]?.labelOn === 'headroom' ? rows[item.dataIndex].text : null),
              barLabelPlacement: 'outside',
            },
          ]}
        />
      </Box>
      <Box component="dl" sx={{ display: 'grid', rowGap: 0.75, mt: 1.5, mb: 0 }}>
        {rows.map((row) => (
          <Box key={row.key} data-testid={`risk-factor-${row.key}`} sx={{ typography: 'body2' }}>
            <Box component="dt" sx={{ display: 'inline', fontWeight: 600 }}>
              {row.label}:
            </Box>{' '}
            <Box component="dd" sx={{ display: 'inline', m: 0, color: 'text.secondary' }}>
              {row.detail || `${row.text} points`}
            </Box>
          </Box>
        ))}
      </Box>
    </>
  );
}

RiskFactorBars.propTypes = {
  factors: PropTypes.arrayOf(factorShape).isRequired,
  ariaLabel: PropTypes.string,
};

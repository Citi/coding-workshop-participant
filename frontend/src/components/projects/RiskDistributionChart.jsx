import PropTypes from 'prop-types';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import Link from '@mui/material/Link';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import ChartCard from './ChartCard.jsx';
import { BAND_GAP_RATIO, BAR_RADIUS, axisMaxWithHeadroom, tickLabelStyle } from './chartTheme.js';
import RiskChip from '../RiskChip.jsx';
import { RISK_LABELS, RISK_LEVELS } from '../../constants.js';
import { riskColor } from '../../theme.js';
import { formatNumber } from '../../utils/format.js';

const CHART_HEIGHT = 230;

/**
 * Link to the projects list filtered by one risk level.
 * @param {string} level - LOW, MEDIUM, HIGH or CRITICAL.
 * @returns {string} Path such as `/projects?risk_level=HIGH`.
 */
function levelPath(level) {
  return `/projects?risk_level=${encodeURIComponent(level)}`;
}

/**
 * Dashboard chart: how many projects sit at each risk level (spec 1, question 2). Bars use
 * the theme's risk colours, and the axis names every level, so colour is never the only cue.
 * Clicking a bar (or a count in the table view) opens the projects list filtered by level.
 * @param {object} props - Component props.
 * @param {Record<string, number>} [props.countsByLevel] - `risk_by_level` from the dashboard API.
 * @param {boolean} [props.loading] - Show a skeleton.
 * @returns {JSX.Element} The chart card.
 */
export default function RiskDistributionChart({ countsByLevel = {}, loading = false }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const rows = RISK_LEVELS.map((level) => ({
    id: level,
    level,
    label: RISK_LABELS[level],
    count: Number(countsByLevel[level] ?? 0),
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const counts = rows.map((row) => row.count);
  const atRisk = (countsByLevel.HIGH ?? 0) + (countsByLevel.CRITICAL ?? 0);
  const summary = `Projects by risk level: ${rows.map((row) => `${row.label} ${row.count}`).join(', ')}.`;

  return (
    <ChartCard
      title="Risk distribution"
      subtitle={`${formatNumber(atRisk)} of ${formatNumber(total)} at high or critical risk`}
      summary={summary}
      loading={loading}
      empty={!loading && total === 0}
      emptyMessage="Risk levels appear once the portfolio has projects."
      height={CHART_HEIGHT}
      table={{
        columns: [
          { key: 'level', header: 'Risk level', render: (row) => <RiskChip level={row.level} /> },
          {
            key: 'count',
            header: 'Projects',
            align: 'right',
            render: (row) => (
              <Link component={RouterLink} to={levelPath(row.level)} aria-label={`${row.count} ${row.label.toLowerCase()} risk projects`}>
                {formatNumber(row.count)}
              </Link>
            ),
          },
        ],
        rows,
      }}
    >
      <BarChart
        height={CHART_HEIGHT}
        margin={{ top: 20, right: 8, bottom: 8, left: 8 }}
        hideLegend
        borderRadius={BAR_RADIUS}
        grid={{ horizontal: true }}
        onItemClick={(_, item) => {
          const level = RISK_LEVELS[item?.dataIndex];
          if (level) {
            navigate(levelPath(level));
          }
        }}
        xAxis={[
          {
            scaleType: 'band',
            data: rows.map((row) => row.label),
            categoryGapRatio: BAND_GAP_RATIO,
            disableTicks: true,
            tickLabelStyle: tickLabelStyle(theme),
          },
        ]}
        yAxis={[
          {
            min: 0,
            max: axisMaxWithHeadroom(counts),
            tickMinStep: 1,
            width: 32,
            valueFormatter: (value) => formatNumber(value),
            tickLabelStyle: tickLabelStyle(theme),
          },
        ]}
        series={[
          {
            data: counts,
            label: 'Projects',
            color: theme.palette.primary.main,
            colorGetter: ({ dataIndex }) => riskColor(RISK_LEVELS[dataIndex]),
            valueFormatter: (value) => `${formatNumber(value)} project${value === 1 ? '' : 's'}`,
            barLabel: (item) => (item.value ? formatNumber(item.value) : null),
            barLabelPlacement: 'outside',
          },
        ]}
      />
    </ChartCard>
  );
}

RiskDistributionChart.propTypes = {
  countsByLevel: PropTypes.objectOf(PropTypes.number),
  loading: PropTypes.bool,
};

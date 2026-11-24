import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import DataTable from '../DataTable.jsx';
import EmptyState from '../EmptyState.jsx';
import useIsMobile from '../../hooks/useIsMobile.js';

const columnShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  header: PropTypes.string.isRequired,
  align: PropTypes.oneOf(['left', 'right', 'center']),
  render: PropTypes.func,
});

/**
 * Turn chart table columns into DataTable columns; the first column heads each card.
 * @param {Array<{key: string, header: string, align?: string, render?: Function}>} columns - Chart table columns.
 * @returns {object[]} DataTable column definitions.
 */
function toCardColumns(columns) {
  return columns.map((column, index) => ({
    field: column.key,
    header: column.header,
    align: column.align,
    render: column.render,
    primary: index === 0,
  }));
}

/**
 * The table twin of a chart: every plotted value in rows and columns.
 * @param {object} props - Component props.
 * @param {string} props.label - Accessible name of the table.
 * @param {Array<{key: string, header: string, align?: string, render?: Function}>} props.columns - Columns.
 * @param {object[]} props.rows - Rows; each needs an `id`.
 * @returns {JSX.Element} The table.
 */
function ChartTable({ label, columns, rows }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} align={column.align}>
                {column.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column) => (
                <TableCell key={column.key} align={column.align} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {column.render ? column.render(row) : row[column.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

ChartTable.propTypes = {
  label: PropTypes.string.isRequired,
  columns: PropTypes.arrayOf(columnShape).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
};

/**
 * Card holding one dashboard chart, with a switch to a table view of the same numbers so no
 * value depends on reading a chart (or its colours). On phones the table view is the shared
 * DataTable's stacked cards (spec 12.4), one card per row headed by its first column. Shows a
 * skeleton while loading and an empty state when there is nothing to plot.
 * @param {object} props - Component props.
 * @param {string} props.title - Card heading (an h2).
 * @param {import('react').ReactNode} [props.subtitle] - One line under the heading.
 * @param {string} props.summary - Plain-text summary of the plotted values (the chart's accessible name).
 * @param {{columns: object[], rows: object[]}} props.table - Table view of the same data.
 * @param {boolean} [props.loading] - Show a skeleton.
 * @param {boolean} [props.empty] - Show an empty state instead of the chart.
 * @param {string} [props.emptyMessage] - Empty state text.
 * @param {number} [props.height] - Chart height in pixels (used for the skeleton too).
 * @param {import('react').ReactNode} props.children - The chart.
 * @returns {JSX.Element} The card.
 */
export default function ChartCard({
  title,
  subtitle,
  summary,
  table,
  loading = false,
  empty = false,
  emptyMessage = 'There is nothing to show yet.',
  height = 240,
  children,
}) {
  const headingId = useId();
  const isMobile = useIsMobile();
  const [view, setView] = useState('chart');
  let body;
  if (loading) {
    body = <Skeleton variant="rounded" height={height} data-testid="chart-skeleton" />;
  } else if (empty) {
    body = <EmptyState title="No data yet" message={emptyMessage} />;
  } else if (view === 'table') {
    body = isMobile ? (
      <DataTable columns={toCardColumns(table.columns)} rows={table.rows} ariaLabel={title} />
    ) : (
      <ChartTable label={title} columns={table.columns} rows={table.rows} />
    );
  } else {
    body = (
      <Box role="figure" aria-label={summary} sx={{ height, minWidth: 0 }}>
        {children}
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby={headingId}
      sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id={headingId} variant="h6" component="h2">
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {!loading && !empty ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, next) => {
              if (next) {
                setView(next);
              }
            }}
            aria-label={`${title}: chart or table`}
          >
            <Tooltip title="Chart view">
              <ToggleButton value="chart" aria-label="Chart view">
                <BarChartIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip title="Table view">
              <ToggleButton value="table" aria-label="Table view">
                <TableRowsOutlinedIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        ) : null}
      </Stack>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{body}</Box>
    </Paper>
  );
}

ChartCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  summary: PropTypes.string.isRequired,
  table: PropTypes.shape({
    columns: PropTypes.arrayOf(columnShape).isRequired,
    rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  loading: PropTypes.bool,
  empty: PropTypes.bool,
  emptyMessage: PropTypes.string,
  height: PropTypes.number,
  children: PropTypes.node.isRequired,
};

import { Fragment } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import EmptyState from './EmptyState.jsx';
import ErrorState from './ErrorState.jsx';
import { PAGE_SIZE_OPTIONS } from '../constants.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { EMPTY_VALUE } from '../utils/format.js';

const columnShape = PropTypes.shape({
  field: PropTypes.string.isRequired,
  header: PropTypes.string.isRequired,
  render: PropTypes.func,
  align: PropTypes.oneOf(['left', 'right', 'center']),
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  hideOnMobile: PropTypes.bool,
  primary: PropTypes.bool,
});

function defaultRowId(row) {
  return row.id;
}

function cellContent(column, row) {
  if (column.render) {
    return column.render(row);
  }
  const value = row[column.field];
  return value === null || value === undefined || value === '' ? EMPTY_VALUE : value;
}

function activateOnKey(event, callback) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    callback();
  }
}

function DesktopTable({ columns, rows, getRowId, showSkeleton, skeletonRows, onRowClick, rowActions, ariaLabel }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={ariaLabel}>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.field} align={column.align} sx={{ width: column.width }}>
                {column.header}
              </TableCell>
            ))}
            {rowActions ? <TableCell align="right">Actions</TableCell> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {showSkeleton
            ? Array.from({ length: skeletonRows }, (_, index) => (
                <TableRow key={`skeleton-${index}`} data-testid="table-skeleton-row">
                  {columns.map((column) => (
                    <TableCell key={column.field}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                  {rowActions ? <TableCell /> : null}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  hover={Boolean(onRowClick)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (event) => activateOnKey(event, () => onRowClick(row)) : undefined}
                  sx={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((column) => (
                    <TableCell key={column.field} align={column.align}>
                      {cellContent(column, row)}
                    </TableCell>
                  ))}
                  {rowActions ? (
                    <TableCell
                      align="right"
                      sx={{ whiteSpace: 'nowrap' }}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {rowActions(row)}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

DesktopTable.propTypes = {
  columns: PropTypes.arrayOf(columnShape).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  getRowId: PropTypes.func.isRequired,
  showSkeleton: PropTypes.bool.isRequired,
  skeletonRows: PropTypes.number.isRequired,
  onRowClick: PropTypes.func,
  rowActions: PropTypes.func,
  ariaLabel: PropTypes.string,
};

function CardBody({ primaryColumn, detailColumns, row }) {
  return (
    <CardContent>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {cellContent(primaryColumn, row)}
      </Typography>
      {detailColumns.length > 0 ? (
        <Box
          component="dl"
          sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75, mt: 1, mb: 0 }}
        >
          {detailColumns.map((column) => (
            <Fragment key={column.field}>
              <Typography component="dt" variant="body2" color="text.secondary">
                {column.header}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                {cellContent(column, row)}
              </Typography>
            </Fragment>
          ))}
        </Box>
      ) : null}
    </CardContent>
  );
}

CardBody.propTypes = {
  primaryColumn: columnShape.isRequired,
  detailColumns: PropTypes.arrayOf(columnShape).isRequired,
  row: PropTypes.object.isRequired,
};

function MobileCards({ columns, rows, getRowId, showSkeleton, skeletonRows, onRowClick, rowActions, ariaLabel }) {
  const primaryColumn = columns.find((column) => column.primary) ?? columns[0];
  const detailColumns = columns.filter((column) => column !== primaryColumn && !column.hideOnMobile);

  if (showSkeleton) {
    return (
      <Stack spacing={1.5}>
        {Array.from({ length: Math.min(skeletonRows, 3) }, (_, index) => (
          <Skeleton key={`skeleton-${index}`} variant="rounded" height={112} data-testid="card-skeleton" />
        ))}
      </Stack>
    );
  }

  return (
    <Stack component="ul" spacing={1.5} aria-label={ariaLabel} sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {rows.map((row) => (
        <Card component="li" key={getRowId(row)} variant="outlined">
          {onRowClick ? (
            <CardActionArea onClick={() => onRowClick(row)}>
              <CardBody primaryColumn={primaryColumn} detailColumns={detailColumns} row={row} />
            </CardActionArea>
          ) : (
            <CardBody primaryColumn={primaryColumn} detailColumns={detailColumns} row={row} />
          )}
          {rowActions ? <CardActions sx={{ justifyContent: 'flex-end' }}>{rowActions(row)}</CardActions> : null}
        </Card>
      ))}
    </Stack>
  );
}

MobileCards.propTypes = DesktopTable.propTypes;

/**
 * Responsive data table: an MUI table on desktop and stacked cards on mobile (spec 12.4),
 * with a loading skeleton, an empty state, an error state and optional server pagination.
 *
 * Make the primary column a link for keyboard users, or pass `onRowClick` (rows then
 * respond to Enter and Space as well as clicks). Do not combine both on the same table.
 *
 * @example
 * <DataTable
 *   columns={[{ field: 'project_name', header: 'Project', primary: true },
 *             { field: 'risk_level', header: 'Risk', render: (p) => <RiskChip level={p.risk_level} /> }]}
 *   rows={data?.items} loading={loading} error={error} onRetry={reload}
 *   pagination={{ total: data?.total ?? 0, page, rowsPerPage, onPageChange: setPage, onRowsPerPageChange: setRowsPerPage }}
 * />
 *
 * @param {object} props - Component props.
 * @param {Array<{field: string, header: string, render?: Function, align?: string, width?: number|string,
 *   hideOnMobile?: boolean, primary?: boolean}>} props.columns - Column definitions.
 * @param {object[]} [props.rows] - Rows to show.
 * @param {(row: object) => string|number} [props.getRowId] - Unique key per row (default `row.id`).
 * @param {boolean} [props.loading] - Shows skeletons when there are no rows yet, a progress bar otherwise.
 * @param {Error|null} [props.error] - Shows an error state.
 * @param {() => void} [props.onRetry] - Retry handler for the error state.
 * @param {string} [props.emptyTitle] - Empty state heading.
 * @param {import('react').ReactNode} [props.emptyMessage] - Empty state text.
 * @param {import('react').ReactNode} [props.emptyAction] - Empty state action, e.g. a create button.
 * @param {(row: object) => void} [props.onRowClick] - Makes rows clickable.
 * @param {(row: object) => import('react').ReactNode} [props.rowActions] - Per-row buttons.
 * @param {{total: number, page: number, rowsPerPage: number, onPageChange: (page: number) => void,
 *   onRowsPerPageChange: (rows: number) => void, rowsPerPageOptions?: number[]}} [props.pagination]
 *   Server pagination state (see `usePagination`).
 * @param {number} [props.skeletonRows] - Skeleton rows while loading.
 * @param {string} [props.ariaLabel] - Accessible name of the table.
 * @returns {JSX.Element} The table.
 */
export default function DataTable({
  columns,
  rows,
  getRowId = defaultRowId,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyAction,
  onRowClick,
  rowActions,
  pagination,
  skeletonRows = 5,
  ariaLabel,
}) {
  const isMobile = useIsMobile();
  const safeRows = Array.isArray(rows) ? rows : [];
  const showSkeleton = loading && safeRows.length === 0;

  if (error && safeRows.length === 0 && !loading) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  const isEmpty = !loading && safeRows.length === 0;
  const Layout = isMobile ? MobileCards : DesktopTable;
  const layoutProps = {
    columns,
    rows: safeRows,
    getRowId,
    showSkeleton,
    skeletonRows,
    onRowClick,
    rowActions,
    ariaLabel,
  };

  return (
    <Box aria-busy={loading}>
      {error && safeRows.length > 0 ? <ErrorState error={error} onRetry={onRetry} /> : null}
      {loading && safeRows.length > 0 ? (
        <LinearProgress aria-label="Refreshing" sx={{ mb: 0.5, borderRadius: 1 }} />
      ) : null}
      {isEmpty ? (
        <Paper variant="outlined">
          <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
        </Paper>
      ) : (
        <Layout {...layoutProps} />
      )}
      {pagination && pagination.total > 0 ? (
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          rowsPerPageOptions={pagination.rowsPerPageOptions ?? [...PAGE_SIZE_OPTIONS]}
          onPageChange={(_, page) => pagination.onPageChange(page)}
          onRowsPerPageChange={(event) => pagination.onRowsPerPageChange(Number(event.target.value))}
          labelRowsPerPage={isMobile ? 'Rows' : 'Rows per page'}
        />
      ) : null}
    </Box>
  );
}

DataTable.propTypes = {
  columns: PropTypes.arrayOf(columnShape).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object),
  getRowId: PropTypes.func,
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.instanceOf(Error), PropTypes.object]),
  onRetry: PropTypes.func,
  emptyTitle: PropTypes.string,
  emptyMessage: PropTypes.node,
  emptyAction: PropTypes.node,
  onRowClick: PropTypes.func,
  rowActions: PropTypes.func,
  pagination: PropTypes.shape({
    total: PropTypes.number.isRequired,
    page: PropTypes.number.isRequired,
    rowsPerPage: PropTypes.number.isRequired,
    onPageChange: PropTypes.func.isRequired,
    onRowsPerPageChange: PropTypes.func.isRequired,
    rowsPerPageOptions: PropTypes.arrayOf(PropTypes.number),
  }),
  skeletonRows: PropTypes.number,
  ariaLabel: PropTypes.string,
};

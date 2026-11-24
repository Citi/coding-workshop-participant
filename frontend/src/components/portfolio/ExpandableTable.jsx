import { Fragment, useId, useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import EmptyState from '../EmptyState.jsx';
import ErrorState from '../ErrorState.jsx';
import { PAGE_SIZE_OPTIONS } from '../../constants.js';
import useIsMobile from '../../hooks/useIsMobile.js';
import { EMPTY_VALUE } from '../../utils/format.js';

const columnShape = PropTypes.shape({
  field: PropTypes.string.isRequired,
  header: PropTypes.string.isRequired,
  render: PropTypes.func,
  align: PropTypes.oneOf(['left', 'right', 'center']),
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  hideOnMobile: PropTypes.bool,
  primary: PropTypes.bool,
});

function cellContent(column, row) {
  if (column.render) {
    return column.render(row);
  }
  const value = row[column.field];
  return value === null || value === undefined || value === '' ? EMPTY_VALUE : value;
}

// Pixel strings on purpose: MUI's sx reads width/height values from 0 to 1 as fractions (1 = 100%).
const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
};

/**
 * Accessible name of a row's toggle, naming the action it will take.
 * @param {boolean} open - Whether the detail is showing.
 * @param {string} detail - What the detail holds, e.g. "conflict windows and load for Priya Nair".
 * @returns {string} "Show …" or "Hide …".
 */
function toggleName(open, detail) {
  return `${open ? 'Hide' : 'Show'} ${detail}`;
}

function ExpandableRow({ row, columns, renderDetail, detailLabel }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  return (
    <>
      <TableRow sx={open ? { '& > td': { borderBottom: 'none' } } : undefined}>
        <TableCell padding="checkbox">
          <IconButton
            size="small"
            aria-label={toggleName(open, detailLabel(row))}
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        {columns.map((column) => (
          <TableCell key={column.field} align={column.align}>
            {cellContent(column, row)}
          </TableCell>
        ))}
      </TableRow>
      <TableRow>
        <TableCell colSpan={columns.length + 1} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box id={detailId} sx={{ py: 2, px: { md: 1 } }}>
              {renderDetail(row)}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

ExpandableRow.propTypes = {
  row: PropTypes.object.isRequired,
  columns: PropTypes.arrayOf(columnShape).isRequired,
  renderDetail: PropTypes.func.isRequired,
  detailLabel: PropTypes.func.isRequired,
};

function ExpandableCard({ row, primaryColumn, detailColumns, renderDetail, detailLabel }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const visibleText = open ? 'Hide details' : 'Show details';
  return (
    <Card component="li" variant="outlined">
      <CardContent sx={{ pb: 1 }}>
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
      <CardActions sx={{ pt: 0 }}>
        {/* The accessible name starts with the visible words (WCAG 2.5.3 label in name) and
            then says which row it is. */}
        <Button
          size="small"
          aria-label={`${visibleText}: ${detailLabel(row)}`}
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          endIcon={open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          onClick={() => setOpen((value) => !value)}
        >
          {visibleText}
        </Button>
      </CardActions>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <CardContent id={detailId} sx={{ pt: 0 }}>
          {renderDetail(row)}
        </CardContent>
      </Collapse>
    </Card>
  );
}

ExpandableCard.propTypes = {
  row: PropTypes.object.isRequired,
  primaryColumn: columnShape.isRequired,
  detailColumns: PropTypes.arrayOf(columnShape).isRequired,
  renderDetail: PropTypes.func.isRequired,
  detailLabel: PropTypes.func.isRequired,
};

function DesktopRows({ columns, rows, getRowId, showSkeleton, skeletonRows, renderDetail, detailLabel, ariaLabel }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={ariaLabel}>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Box component="span" sx={visuallyHidden}>
                Details
              </Box>
            </TableCell>
            {columns.map((column) => (
              <TableCell key={column.field} align={column.align} sx={{ width: column.width }}>
                {column.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {showSkeleton
            ? Array.from({ length: skeletonRows }, (_, index) => (
                <TableRow key={`skeleton-${index}`} data-testid="table-skeleton-row">
                  <TableCell padding="checkbox" />
                  {columns.map((column) => (
                    <TableCell key={column.field}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => (
                <ExpandableRow
                  key={getRowId(row)}
                  row={row}
                  columns={columns}
                  renderDetail={renderDetail}
                  detailLabel={detailLabel}
                />
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

DesktopRows.propTypes = {
  columns: PropTypes.arrayOf(columnShape).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  getRowId: PropTypes.func.isRequired,
  showSkeleton: PropTypes.bool.isRequired,
  skeletonRows: PropTypes.number.isRequired,
  renderDetail: PropTypes.func.isRequired,
  detailLabel: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string,
};

function MobileCards({ columns, rows, getRowId, showSkeleton, skeletonRows, renderDetail, detailLabel, ariaLabel }) {
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
        <ExpandableCard
          key={getRowId(row)}
          row={row}
          primaryColumn={primaryColumn}
          detailColumns={detailColumns}
          renderDetail={renderDetail}
          detailLabel={detailLabel}
        />
      ))}
    </Stack>
  );
}

MobileCards.propTypes = DesktopRows.propTypes;

function defaultRowId(row) {
  return row.id;
}

/**
 * Responsive table whose rows open to show more detail: an MUI table with an expand button
 * per row on desktop, stacked cards with a "Show details" button on mobile (spec 12.4).
 * Same loading skeleton, empty state, error state and pagination as DataTable.
 *
 * @param {object} props - Component props.
 * @param {Array<{field: string, header: string, render?: Function, align?: string, width?: number|string,
 *   hideOnMobile?: boolean, primary?: boolean}>} props.columns - Column definitions.
 * @param {object[]} [props.rows] - Rows to show.
 * @param {(row: object) => string|number} [props.getRowId] - Unique key per row (default `row.id`).
 * @param {(row: object) => import('react').ReactNode} props.renderDetail - Content of an opened row.
 * @param {(row: object) => string} props.detailLabel - What an opened row shows, in lower case,
 *   e.g. "conflict windows and load for Priya Nair". The desktop toggle is named "Show …" or
 *   "Hide …" from it; the mobile button is named "Show details: …" or "Hide details: …", so
 *   its name starts with its visible words.
 * @param {boolean} [props.loading] - Skeletons when there are no rows yet, a progress bar otherwise.
 * @param {Error|null} [props.error] - Shows an error state.
 * @param {() => void} [props.onRetry] - Retry handler for the error state.
 * @param {string} [props.emptyTitle] - Empty state heading.
 * @param {import('react').ReactNode} [props.emptyMessage] - Empty state text.
 * @param {import('react').ReactNode} [props.emptyAction] - Empty state action.
 * @param {{total: number, page: number, rowsPerPage: number, onPageChange: (page: number) => void,
 *   onRowsPerPageChange: (rows: number) => void}} [props.pagination] - Server pagination state.
 * @param {number} [props.skeletonRows] - Skeleton rows while loading.
 * @param {string} [props.ariaLabel] - Accessible name of the table.
 * @returns {JSX.Element} The table.
 */
export default function ExpandableTable({
  columns,
  rows,
  getRowId = defaultRowId,
  renderDetail,
  detailLabel,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyAction,
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
  const Layout = isMobile ? MobileCards : DesktopRows;

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
        <Layout
          columns={columns}
          rows={safeRows}
          getRowId={getRowId}
          showSkeleton={showSkeleton}
          skeletonRows={skeletonRows}
          renderDetail={renderDetail}
          detailLabel={detailLabel}
          ariaLabel={ariaLabel}
        />
      )}
      {pagination && pagination.total > 0 ? (
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
          onPageChange={(_, page) => pagination.onPageChange(page)}
          onRowsPerPageChange={(event) => pagination.onRowsPerPageChange(Number(event.target.value))}
          labelRowsPerPage={isMobile ? 'Rows' : 'Rows per page'}
        />
      ) : null}
    </Box>
  );
}

ExpandableTable.propTypes = {
  columns: PropTypes.arrayOf(columnShape).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object),
  getRowId: PropTypes.func,
  renderDetail: PropTypes.func.isRequired,
  detailLabel: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.instanceOf(Error), PropTypes.object]),
  onRetry: PropTypes.func,
  emptyTitle: PropTypes.string,
  emptyMessage: PropTypes.node,
  emptyAction: PropTypes.node,
  pagination: PropTypes.shape({
    total: PropTypes.number.isRequired,
    page: PropTypes.number.isRequired,
    rowsPerPage: PropTypes.number.isRequired,
    onPageChange: PropTypes.func.isRequired,
    onRowsPerPageChange: PropTypes.func.isRequired,
  }),
  skeletonRows: PropTypes.number,
  ariaLabel: PropTypes.string,
};

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import { useMediaQuery } from 'react-responsive';
import { motion } from 'framer-motion';
import EmptyState from './EmptyState';
import { listContainer, listItem } from '../../utils/motion';

/**
 * The app's one table: search, filters, sorting, pagination, and the four
 * states every collection view needs (loading, error, empty, populated).
 *
 * Below 900px each row becomes a card. A six-column table on a phone forces
 * horizontal scrolling and hides the columns that matter, so the layout
 * changes rather than shrinks.
 *
 * Filtering is client-side, which suits the page sizes here.
 *
 * Column shape:
 *   {
 *     field: 'name',
 *     header: 'Project',
 *     sortable: true,                   // default true
 *     align: 'left' | 'right',
 *     render: (row) => ReactNode,       // defaults to row[field]
 *     value: (row) => any,              // sort/search key, defaults to row[field]
 *     hideOnMobile: false,              // omitted from the card layout
 *     primary: false,                   // used as the card's heading
 *   }
 */
export default function DataTable({
  columns,
  rows = [],
  rowKey = 'id',
  loading = false,
  error = null,
  onRetry,
  searchable = true,
  searchPlaceholder = 'Search…',
  filters = [],
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction = null,
  onRowClick,
  renderRowActions,
  initialSortBy,
  initialRowsPerPage = 10,
  toolbarActions = null,
}) {
  const isMobile = useMediaQuery({ maxWidth: 899 });

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(initialSortBy ?? null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

  const columnValue = (column, row) => (column.value ? column.value(row) : row[column.field]);

  const searched = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((column) => {
        const value = columnValue(column, row);
        return value != null && String(value).toLowerCase().includes(needle);
      }),
    );
  }, [rows, columns, search]);

  const sorted = useMemo(() => {
    if (!sortBy) return searched;
    const column = columns.find((c) => c.field === sortBy);
    if (!column) return searched;

    // Copy first: Array.prototype.sort mutates, and `rows` is the caller's.
    return [...searched].sort((a, b) => {
      const left = columnValue(column, a);
      const right = columnValue(column, b);

      // Nulls sort last in both directions -- an empty due date is not
      // "earliest", it is "unknown", and burying it keeps the top of the
      // table meaningful.
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;

      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true });

      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [searched, columns, sortBy, sortDir]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [sorted, page, rowsPerPage]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const handleSearch = (event) => {
    setSearch(event.target.value);
    // Staying on page 4 of a narrowed result set shows an empty table.
    setPage(0);
  };

  const visibleColumns = isMobile ? columns.filter((c) => !c.hideOnMobile) : columns;
  const hasToolbar = searchable || filters.length > 0 || toolbarActions;

  // -- States ---------------------------------------------------------------

  const renderBody = () => {
    if (loading) {
      return (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', p: 6 }}
          role="status"
          aria-live="polite"
        >
          <CircularProgress aria-label="Loading results" />
        </Box>
      );
    }

    if (error) {
      return (
        <Alert
          severity="error"
          sx={{ m: 2 }}
          action={
            onRetry && (
              <Button color="inherit" size="small" onClick={onRetry}>
                Retry
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      );
    }

    if (!paged.length) {
      // A fruitless search is a different problem from an empty collection:
      // one needs a wider filter, the other needs a first record.
      return search.trim() ? (
        <EmptyState
          title={`No results for “${search.trim()}”`}
          description="Try a shorter search term, or clear the filters."
        />
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      );
    }

    return isMobile ? renderCards() : renderTable();
  };

  // -- Mobile: one card per row --------------------------------------------

  const renderCards = () => {
    const primary = visibleColumns.find((c) => c.primary) ?? visibleColumns[0];
    const rest = visibleColumns.filter((c) => c !== primary);

    return (
      <Stack
        component={motion.div}
        key={page}
        variants={listContainer}
        initial="hidden"
        animate="show"
        spacing={1.5}
        sx={{ p: 2 }}
      >
        {paged.map((row) => (
          <Card
            component={motion.div}
            variants={listItem}
            whileHover={onRowClick ? { y: -2 } : undefined}
            key={row[rowKey]}
            variant="outlined"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
          >
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                spacing={1}
              >
                <Typography variant="h4" component="h3">
                  {primary.render ? primary.render(row) : row[primary.field]}
                </Typography>
                {renderRowActions && (
                  // Row actions must not also trigger the card's navigation.
                  <Box onClick={(event) => event.stopPropagation()}>{renderRowActions(row)}</Box>
                )}
              </Stack>

              <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                {rest.map((column) => (
                  <Stack
                    key={column.field}
                    direction="row"
                    justifyContent="space-between"
                    spacing={2}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {column.header}
                    </Typography>
                    <Box sx={{ textAlign: 'right' }}>
                      {column.render ? column.render(row) : (row[column.field] ?? '—')}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  };

  // -- Desktop: a real table ------------------------------------------------

  const renderTable = () => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {visibleColumns.map((column) => (
              <TableCell
                key={column.field}
                align={column.align || 'left'}
                sortDirection={sortBy === column.field ? sortDir : false}
              >
                {column.sortable === false ? (
                  column.header
                ) : (
                  <TableSortLabel
                    active={sortBy === column.field}
                    direction={sortBy === column.field ? sortDir : 'asc'}
                    onClick={() => handleSort(column.field)}
                  >
                    {column.header}
                  </TableSortLabel>
                )}
              </TableCell>
            ))}
            {renderRowActions && (
              <TableCell align="right" sx={{ width: 1 }}>
                Actions
              </TableCell>
            )}
          </TableRow>
        </TableHead>

        <TableBody
          component={motion.tbody}
          key={page}
          variants={listContainer}
          initial="hidden"
          animate="show"
        >
          {paged.map((row) => (
            <TableRow
              component={motion.tr}
              variants={listItem}
              key={row[rowKey]}
              hover={Boolean(onRowClick)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {visibleColumns.map((column) => (
                <TableCell key={column.field} align={column.align || 'left'}>
                  {column.render ? column.render(row) : (row[column.field] ?? '—')}
                </TableCell>
              ))}
              {renderRowActions && (
                <TableCell
                  align="right"
                  onClick={(event) => event.stopPropagation()}
                  // Match the header cell: shrink the column to the buttons and
                  // keep them on one line, so the actions sit directly under the
                  // right-aligned "Actions" heading instead of drifting left.
                  sx={{ width: 1, whiteSpace: 'nowrap' }}
                >
                  <Box sx={{ display: 'inline-flex' }}>{renderRowActions(row)}</Box>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Paper>
      {hasToolbar && (
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
          alignItems={{ md: 'center' }}
        >
          {searchable && (
            <TextField
              value={search}
              onChange={handleSearch}
              placeholder={searchPlaceholder}
              size="small"
              type="search"
              sx={{ flexGrow: 1, minWidth: { md: 240 } }}
              slotProps={{
                htmlInput: { 'aria-label': searchPlaceholder },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch('')} aria-label="Clear search">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
          )}

          {filters.map((filter) => (
            <TextField
              key={filter.name}
              select
              size="small"
              label={filter.label}
              value={filter.value ?? ''}
              onChange={(event) => {
                filter.onChange(event.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">All</MenuItem>
              {filter.options.map((option) => {
                const item = typeof option === 'object' ? option : { value: option, label: option };
                return (
                  <MenuItem key={String(item.value)} value={item.value}>
                    {item.label}
                  </MenuItem>
                );
              })}
            </TextField>
          ))}

          {toolbarActions && <Box sx={{ ml: { md: 'auto' } }}>{toolbarActions}</Box>}
        </Stack>
      )}

      {renderBody()}

      {!loading && !error && sorted.length > 0 && (
        <TablePagination
          component="div"
          count={sorted.length}
          page={page}
          onPageChange={(_, next) => setPage(next)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}
    </Paper>
  );
}

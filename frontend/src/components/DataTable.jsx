import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Typography from '@mui/material/Typography'
import { useMediaQuery } from 'react-responsive'
import { useIsMobile } from '../hooks/useIsMobile'
import { EmptyState, ErrorState, LoadingState } from './StateViews'

/** Below MUI's "lg" breakpoint the permanent side menu leaves a table only ~610-910px. */
const COMPACT_MAX_WIDTH = 1199

/** Keyboard focus on a clickable row (MUI's TableRow removes the browser outline). */
const focusableRow = (theme) => ({
  cursor: 'pointer',
  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: '-2px' },
})

/** The actions column stays at the right edge when a wide table scrolls sideways. */
const stickyActions = (theme) => ({
  position: 'sticky',
  right: 0,
  zIndex: 1,
  backgroundColor: theme.palette.background.paper,
  // Opaque so scrolled columns pass underneath; the row's hover tint and focus ring continue on it.
  '.MuiTableRow-hover:hover > &': {
    backgroundImage: `linear-gradient(${theme.palette.action.hover}, ${theme.palette.action.hover})`,
  },
  'tr:focus-visible > &': {
    boxShadow: ['inset 0 2px', 'inset -2px 0', 'inset 0 -2px'].map((edge) => `${edge} 0 ${theme.palette.primary.main}`).join(', '),
  },
})

/**
 * Header cells keep their one- or two-word text on one line ("Team size", not "Team / size"): a
 * narrow screen scrolls the table inside its container instead.
 */
const headerCellStyle = { whiteSpace: 'nowrap' }

/**
 * Sortable header button: a visible focus ring, and the arrow hinted on keyboard focus as on hover.
 * The arrow sits in the cell's padding, on the side MUI puts it (after the text; before it in a
 * right-aligned column), rather than in room kept beside the text, so the hidden arrow does not
 * widen the column (vertically it stays centred: the label is a flex box).
 */
const sortLabelStyle = (theme) => ({
  borderRadius: '4px',
  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
  '&:focus-visible:not(.Mui-active) .MuiTableSortLabel-icon': { opacity: 0.5 },
  '& .MuiTableSortLabel-icon': { position: 'absolute', left: '100%' },
  '.MuiTableCell-alignRight > & .MuiTableSortLabel-icon': { left: 'auto', right: '100%' },
})

// Text sorts like people read it: case-insensitive, and "Phase 2" before "Phase 10".
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

const isEmpty = (value) => value === null || value === undefined || value === '' || Number.isNaN(value)

/** Order of two non-empty sort values: numbers by size, ISO dates by time, false before true, text by collation. */
function compareValues(a, b) {
  const bothAre = (type) => typeof a === type && typeof b === type
  if (bothAre('number') || bothAre('boolean') || (bothAre('string') && ISO_DATE.test(a) && ISO_DATE.test(b))) {
    if (a === b) return 0
    return a < b ? -1 : 1
  }
  return collator.compare(String(a), String(b))
}

/** Stable sort: equal values keep the API order, and empty ones stay last in both directions. */
function sortRows(rows, column, direction) {
  const valueOf = column.sortValue || ((row) => row[column.field])
  const sign = direction === 'desc' ? -1 : 1
  return rows
    .map((row) => ({ row, value: valueOf(row) }))
    .sort((a, b) => {
      const emptyA = isEmpty(a.value)
      const emptyB = isEmpty(b.value)
      if (emptyA || emptyB) return Number(emptyA) - Number(emptyB)
      return sign * compareValues(a.value, b.value)
    })
    .map(({ row }) => row)
}

/** Header clicks cycle a column through ascending, descending and back to the API order (null). */
function nextSort(current, field) {
  if (current?.field !== field) return { field, direction: 'asc' }
  return current.direction === 'asc' ? { field, direction: 'desc' } : null
}

/**
 * Responsive list: a table on desktop, stacked cards on mobile.
 *
 * columns: [{ field, header, render?(row), align?, hideOnMobile?, width?, sortable?, sortValue?(row) }]
 *   - the first column is the card title on mobile
 *   - hideOnMobile marks a secondary column: left out of the cards, and of the table below 1200px
 *     wide, where the side menu leaves little room
 *   - sortable: the header becomes a button that sorts the rows ascending, then descending, then
 *     back to the API order (rows keep the API order until then). sortValue(row) is the value to
 *     sort by when the cell shows something else (default row[field]), e.g. a label or a rank.
 *     Numbers sort by size, ISO dates by time, booleans false first, text case-insensitively with
 *     numbers in it read as numbers; empty values (null, undefined, '') always come last.
 *     Sorting is client-side, stable and desktop only: the mobile cards keep the API order.
 * rows, loading, error (ApiError|string), onRetry, emptyTitle, emptyMessage, emptyAction
 * errorTitle / refreshErrorTitle - what failed, e.g. 'Could not load the projects' (shown before the
 *   error's message, without rows / above the rows still on screen); generic by default
 * onRowClick?(row) - rows become clickable / keyboard-activatable
 * renderActions?(row) - buttons shown in the last column (desktop, kept in view) or card footer (mobile)
 * ariaLabel - accessible name of the table
 */
export default function DataTable({
  columns,
  rows,
  loading = false,
  error,
  onRetry,
  errorTitle = 'Could not load data',
  refreshErrorTitle = 'Could not refresh data',
  emptyTitle = 'No records found',
  emptyMessage,
  emptyAction,
  onRowClick,
  renderActions,
  ariaLabel = 'Data table',
  getRowId = (row) => row.id,
}) {
  const isMobile = useIsMobile()
  const isCompact = useMediaQuery({ maxWidth: COMPACT_MAX_WIDTH })
  const [sort, setSort] = useState(null)
  const items = rows || []
  const tableColumns = isCompact ? columns.filter((column) => !column.hideOnMobile) : columns
  // A sort on a column that is not shown (e.g. a secondary one on a narrower screen) is not applied,
  // and the mobile cards always keep the API order.
  const sortColumn = sort && !isMobile && tableColumns.find((column) => column.sortable && column.field === sort.field)
  const tableRows = sortColumn ? sortRows(items, sortColumn, sort.direction) : items

  if (error && !items.length) return <ErrorState error={error} onRetry={onRetry} title={errorTitle} />
  if (loading && !items.length) return <LoadingState />
  if (!items.length) {
    return (
      <Paper>
        <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
      </Paper>
    )
  }

  const cell = (column, row) => (column.render ? column.render(row) : (row[column.field] ?? '—'))
  const activate = (row) => (event) => {
    if (event.type === 'click' || event.key === 'Enter' || event.key === ' ') {
      if (event.key === ' ') event.preventDefault()
      onRowClick(row)
    }
  }

  return (
    <Box>
      {error && <ErrorState error={error} onRetry={onRetry} title={refreshErrorTitle} />}
      {loading && <LinearProgress sx={{ mb: 1 }} aria-label="Refreshing" />}
      {isMobile ? (
        <Stack spacing={1.5} aria-label={ariaLabel} role="list">
          {items.map((row) => {
            const [titleColumn, ...rest] = columns
            const content = (
              <CardContent>
                <Typography variant="subtitle1" component="div" sx={{ fontWeight: 600, mb: 1 }}>
                  {cell(titleColumn, row)}
                </Typography>
                <Stack spacing={0.75}>
                  {rest.filter((column) => !column.hideOnMobile).map((column) => (
                    <Box key={column.field} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                      <Typography variant="body2" color="textSecondary">{column.header}</Typography>
                      {/* The theme's body2, as in the table cells: inside a clickable card (a <button>) plain
                          text would otherwise take the browser's button font instead of the app's. */}
                      <Typography component="div" variant="body2" sx={{ textAlign: 'right', minWidth: 0 }}>
                        {cell(column, row)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            )
            return (
              <Card key={getRowId(row)} role="listitem">
                {onRowClick ? <CardActionArea onClick={() => onRowClick(row)}>{content}</CardActionArea> : content}
                {renderActions && <CardActions sx={{ justifyContent: 'flex-end' }}>{renderActions(row)}</CardActions>}
              </Card>
            )
          })}
        </Stack>
      ) : (
        <TableContainer component={Paper}>
          <Table aria-label={ariaLabel} size="medium">
            <TableHead>
              <TableRow>
                {tableColumns.map((column) => {
                  const direction = column === sortColumn ? sort.direction : undefined
                  return (
                    <TableCell key={column.field} align={column.align} sx={[headerCellStyle, { width: column.width }]} sortDirection={direction || false}>
                      {column.sortable ? (
                        <TableSortLabel
                          active={Boolean(direction)}
                          direction={direction || 'asc'}
                          onClick={() => setSort((current) => nextSort(current, column.field))}
                          sx={sortLabelStyle}
                        >
                          {column.header}
                        </TableSortLabel>
                      ) : (
                        column.header
                      )}
                    </TableCell>
                  )
                })}
                {renderActions && (
                  <TableCell align="right" sx={[headerCellStyle, { position: 'sticky', right: 0, zIndex: 1 }]}>
                    Actions
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {tableRows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  hover={Boolean(onRowClick)}
                  onClick={onRowClick ? activate(row) : undefined}
                  onKeyDown={onRowClick ? activate(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  sx={onRowClick ? focusableRow : undefined}
                >
                  {tableColumns.map((column) => (
                    <TableCell key={column.field} align={column.align}>{cell(column, row)}</TableCell>
                  ))}
                  {renderActions && (
                    <TableCell
                      align="right"
                      sx={stickyActions}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Box sx={{ display: 'inline-flex', gap: 0.5 }}>{renderActions(row)}</Box>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

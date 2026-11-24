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
 * Responsive list: a table on desktop, stacked cards on mobile.
 *
 * columns: [{ field, header, render?(row), align?, hideOnMobile?, width? }]
 *   - the first column is the card title on mobile
 *   - hideOnMobile marks a secondary column: left out of the cards, and of the table below 1200px
 *     wide, where the side menu leaves little room
 * rows, loading, error (ApiError|string), onRetry, emptyTitle, emptyMessage, emptyAction
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
  const items = rows || []
  const tableColumns = isCompact ? columns.filter((column) => !column.hideOnMobile) : columns

  if (error && !items.length) return <ErrorState error={error} onRetry={onRetry} title="Could not load data" />
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
      {error && <ErrorState error={error} onRetry={onRetry} title="Could not refresh data" />}
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
                      <Box sx={{ textAlign: 'right', minWidth: 0 }}>{cell(column, row)}</Box>
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
                {tableColumns.map((column) => (
                  <TableCell key={column.field} align={column.align} sx={{ width: column.width }}>
                    {column.header}
                  </TableCell>
                ))}
                {renderActions && (
                  <TableCell align="right" sx={{ position: 'sticky', right: 0, zIndex: 1 }}>
                    Actions
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => (
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

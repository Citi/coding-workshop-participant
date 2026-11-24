import { useCallback, useId, useMemo } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews'
import { useApiQuery } from '../../hooks/useApiQuery'
import { allocationsApi } from '../../services/allocationsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { hasActiveFilters } from '../../utils/filters'
import { formatPercent } from '../../utils/format'
import {
  buildHeatmapGrid,
  columnStatusText,
  HEAT_STEPS,
  HEAT_TEXT,
  heatStep,
  MUTED_BACKGROUND,
  MUTED_TEXT,
  OVER_ALLOCATED_BACKGROUND,
} from './heatmapGrid'
import { OverAllocatedChip } from './ResourceBits'
import { FULL_TIME_PERCENT } from './resourceUtils'

/** The rule behind the totals, as the table's caption. */
const RULE = `Only active projects count toward a person's load; more than ${FULL_TIME_PERCENT}% is over-allocated.`
const FILTERED_EMPTY_MESSAGE = 'No team member matches these filters. Try changing or clearing them.'

/** The sticky name column has a fixed width, so the scroll padding can keep focused links clear of it. */
const NAME_WIDTH = { xs: 128, sm: 176 }

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** Sideways scrolling stays inside the table, never the page; once it has focus the arrow keys scroll it. */
const scrollArea = (theme) => ({
  // The containing block of the visually hidden cell texts (position: absolute): without it they
  // escape the scrolling and widen the page on phones.
  position: 'relative',
  // A size container: the caption wraps at the visible width (100cqi) instead of the wider table's.
  containerType: 'inline-size',
  // Links that receive focus are scrolled clear of the sticky name column (WCAG 2.4.11).
  scrollPaddingLeft: NAME_WIDTH,
  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
})

const tableStyle = {
  // Separate borders stay with the sticky column's cells (collapsed ones belong to the table).
  borderCollapse: 'separate',
  '& caption': { captionSide: 'top', p: 0 },
  '& th, & td': { py: 1, px: 1.5 },
  '& tbody tr:last-of-type > *': { borderBottom: 0 },
}

/** The caption text keeps to the visible width and stays in view while the table scrolls sideways. */
const captionText = { display: 'block', position: 'sticky', left: 0, maxWidth: '100cqi', px: 2, py: 1.5 }

const nameCell = (theme) => ({
  position: 'sticky',
  left: 0,
  zIndex: 1,
  width: NAME_WIDTH,
  minWidth: NAME_WIDTH,
  maxWidth: NAME_WIDTH,
  wordBreak: 'break-word',
  // A shadow, not a border, so the edge moves with the sticky column.
  boxShadow: `inset -1px 0 0 ${theme.palette.divider}`,
})
// Opaque, so the cells scrolled sideways pass underneath (header cells already have the theme's grey).
const nameRowHeader = [nameCell, { bgcolor: 'background.paper' }]

const projectHead = { minWidth: 120, maxWidth: 200, verticalAlign: 'bottom', wordBreak: 'break-word' }
const mutedCell = { bgcolor: MUTED_BACKGROUND }
/** A thicker line before the first project that does not count, and before the totals. */
const groupStart = (theme) => ({ borderLeft: `2px solid ${theme.palette.grey[400]}` })
const valueCell = { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const totalNumber = { display: 'inline-block', minWidth: '4.5ch', textAlign: 'right', fontWeight: 700 }

/**
 * Heat map of who works on what: one row per person (by name) and one column per project they are
 * allocated to, each cell holding the person's allocation % shaded from light to darker blue. Active
 * projects come first; the others follow, greyed out and marked "not counted" (e.g. "Planned – not
 * counted"). The last column is the person's total over active projects, marked "Over-allocated"
 * above 100%. Names link to the person's page, project names to the project's. The table scrolls
 * sideways inside its own focusable region with the names kept in view, so the page never does.
 *
 * It always loads GET /allocations itself. The people to show (GET /resources with the filters)
 * come from the page when it has loaded them already, so the page and its heat map make one
 * request; otherwise the heat map loads them too.
 *
 * resources / resourcesLoading / resourcesError / onRetry - the page's GET /resources items, loading
 *   flag, error and reload, as DataTable takes rows / loading / error / onRetry. The heat map shows
 *   the page's loading and errors as its own, and Retry and Reload call onRetry with its own reload
 *   of the allocations. When none of the first three is passed, it loads the people with `filters`.
 * filters - the Resources page filters ({ search?, department?, over_allocated? }): they word the
 *   empty states, and the heat map's own GET /resources sends them as they are (a new object with
 *   the same values does not load again)
 * emptyTitle / emptyMessage / emptyAction - shown when no one is listed (as in DataTable); by default
 *   the texts depend on whether a filter is set
 */
export default function AllocationHeatmap({ resources, resourcesLoading, resourcesError, onRetry, ...props }) {
  const fromPage = resources !== undefined || resourcesLoading !== undefined || resourcesError !== undefined
  if (!fromPage) return <HeatmapLoadingItsPeople {...props} />
  const people = { items: resources, loading: Boolean(resourcesLoading), error: resourcesError ?? null, reload: onRetry }
  return <Heatmap people={people} {...props} />
}

/** Without the page's people: GET /resources with the filters, by the heat map itself. */
function HeatmapLoadingItsPeople({ filters, ...props }) {
  const signature = JSON.stringify(filters || {})
  const fetchResources = useCallback(() => resourcesApi.list(JSON.parse(signature)), [signature])
  const { data, loading, error, reload } = useApiQuery(fetchResources)
  return <Heatmap people={{ items: data?.items, loading, error, reload }} filters={filters} {...props} />
}

/** people - { items, loading, error, reload? }: the people to show and the state of their request. */
function Heatmap({ people, filters, emptyTitle, emptyMessage, emptyAction }) {
  const fetchAllocations = useCallback(() => allocationsApi.list(), [])
  const allocations = useApiQuery(fetchAllocations)
  const reloadPeople = people.reload
  const reloadAllocations = allocations.reload
  // Retry and Reload fetch both lists, so the cells and the API's totals come from the same moment.
  const reload = useCallback(() => {
    reloadPeople?.()
    reloadAllocations()
  }, [reloadPeople, reloadAllocations])

  const peopleItems = people.items
  const allocationItems = allocations.data?.items
  const grid = useMemo(
    () => (peopleItems && allocationItems ? buildHeatmapGrid(peopleItems, allocationItems) : null),
    [peopleItems, allocationItems],
  )
  const loading = people.loading || allocations.loading
  const error = people.error || allocations.error
  const filtered = hasActiveFilters(filters || {})

  if (!grid?.rows.length) {
    if (error) return <ErrorState error={error} onRetry={reload} title="Could not load the heat map" />
    if (loading) return <LoadingState label="Loading the heat map…" />
    return (
      <Paper>
        <EmptyState
          title={emptyTitle ?? (filtered ? 'No matching resources' : 'No resources yet')}
          message={emptyMessage ?? (filtered ? FILTERED_EMPTY_MESSAGE : 'Team members will appear here once they are added.')}
          action={emptyAction}
        />
      </Paper>
    )
  }

  return (
    <Box>
      {error && <ErrorState error={error} onRetry={reload} title="Could not refresh the heat map" />}
      {loading && <LinearProgress sx={{ mb: 1 }} aria-label="Refreshing" />}
      {!loading && !grid.consistent && (
        <Alert
          severity="warning"
          role="status"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={reload}>
              Reload
            </Button>
          }
        >
          The allocations changed while the heat map was loading, so some figures may be out of date.
        </Alert>
      )}
      {grid.columns.length ? (
        <HeatmapTable grid={grid} />
      ) : (
        <Paper>
          <EmptyState
            title="No allocations to show"
            message={
              filtered
                ? 'No one in this list is allocated to a project yet.'
                : 'Allocate team members to projects to see who works on what.'
            }
          />
        </Paper>
      )}
    </Box>
  )
}

function HeatmapTable({ grid }) {
  const firstUncounted = grid.columns.findIndex((column) => !column.counted)
  return (
    <Paper>
      <TableContainer tabIndex={0} role="region" aria-label="Allocation heat map" sx={scrollArea}>
        <Table size="small" sx={tableStyle}>
          <caption>
            <Box component="span" sx={captionText}>
              {RULE}
            </Box>
          </caption>
          <TableHead>
            <TableRow>
              <TableCell scope="col" sx={[nameCell, { verticalAlign: 'bottom' }]}>
                Team member
              </TableCell>
              {grid.columns.map((column, index) => (
                <TableCell
                  key={column.id}
                  scope="col"
                  align="center"
                  sx={[projectHead, !column.counted && mutedCell, index === firstUncounted && groupStart]}
                >
                  {/* The space keeps name and status apart in the header's text ("Apollo CRM Active"),
                      which screen readers repeat for each cell of the column. */}
                  <Link component={RouterLink} to={`/projects/${column.id}`}>
                    {column.name}
                  </Link>{' '}
                  <Typography component="span" variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                    {columnStatusText(column)}
                  </Typography>
                </TableCell>
              ))}
              <TableCell scope="col" sx={[groupStart, { verticalAlign: 'bottom', whiteSpace: 'nowrap' }]}>
                Total (active)
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {grid.rows.map((row) => (
              <TableRow key={row.resource.id}>
                <TableCell component="th" scope="row" sx={nameRowHeader}>
                  <Link component={RouterLink} to={`/resources/${row.resource.id}`}>
                    {row.resource.full_name}
                  </Link>
                </TableCell>
                {row.cells.map((cell, index) => (
                  <AllocationCell key={cell.projectId} cell={cell} startsGroup={index === firstUncounted} />
                ))}
                <TotalCell row={row} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Legend />
    </Paper>
  )
}

/** One allocation: its % on a shade of blue, or greyed out when the project does not count. */
function AllocationCell({ cell, startsGroup }) {
  const shade = cell.counted
    ? { bgcolor: heatStep(cell.percent)?.background, color: HEAT_TEXT }
    : { bgcolor: MUTED_BACKGROUND, color: MUTED_TEXT }
  return (
    <TableCell align="center" sx={[valueCell, shade, startsGroup && groupStart]}>
      {cell.percent === null ? (
        <Box component="span" sx={VISUALLY_HIDDEN}>
          Not allocated
        </Box>
      ) : (
        formatPercent(cell.percent)
      )}
    </TableCell>
  )
}

/** The person's load over active projects; above 100% in red with an "Over-allocated" badge. */
function TotalCell({ row }) {
  return (
    <TableCell sx={[groupStart, valueCell, row.overAllocated && { bgcolor: OVER_ALLOCATED_BACKGROUND }]}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        <Box component="span" sx={[totalNumber, { color: row.overAllocated ? 'error.main' : HEAT_TEXT }]}>
          {formatPercent(row.total)}
        </Box>
        {row.overAllocated && <OverAllocatedChip />}
      </Box>
    </TableCell>
  )
}

/** What the shades mean (every cell also shows its number, so nothing depends on colour). */
function Legend() {
  const titleId = useId()
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.5,
        px: 2,
        py: 1.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Typography id={titleId} variant="caption" sx={{ fontWeight: 600 }}>
        Shading by allocation:
      </Typography>
      <Box
        component="ul"
        role="list"
        aria-labelledby={titleId}
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}
      >
        {HEAT_STEPS.map((step) => (
          <LegendItem key={step.max} background={step.background}>
            {step.label}
          </LegendItem>
        ))}
        <LegendItem background={MUTED_BACKGROUND}>Project not active – not counted</LegendItem>
      </Box>
    </Box>
  )
}

function LegendItem({ background, children }) {
  return (
    <Typography component="li" variant="caption" color="textSecondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        component="span"
        aria-hidden="true"
        sx={{ flexShrink: 0, width: 14, height: 14, borderRadius: '3px', border: 1, borderColor: 'grey.400', bgcolor: background }}
      />
      {children}
    </Typography>
  )
}

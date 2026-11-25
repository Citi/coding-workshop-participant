import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { useMediaQuery } from 'react-responsive'
import { Link as RouterLink } from 'react-router-dom'
import { EmptyState } from '../../components/StateViews'
import { useIsMobile } from '../../hooks/useIsMobile'
import { todayIso } from '../../utils/format'
import { HEALTH_STATES, labelFor } from '../../utils/labels'
import { buildTimeline, labelAnchor } from './timelineLayout'

/** Phones get the fewest month labels; below 1200px the side menu leaves a narrower chart. */
const PHONE_MAX_WIDTH = 599
const COMPACT_MAX_WIDTH = 1199
const BAR_HEIGHT = 14
const AXIS_LINE_HEIGHT = 20
/** The part of a bar that is not complete yet: a lighter step of the bar's own colour. */
const REMAINING_OPACITY = 0.3
const CLOSED_LABEL = `${labelFor('project', 'completed')} or ${labelFor('project', 'cancelled').toLowerCase()}`
const ANCHOR_SHIFT = { start: 'none', middle: 'translateX(-50%)', end: 'translateX(-100%)' }

const toneColor = (theme, tone) => (tone === 'muted' ? theme.palette.grey[600] : theme.palette[tone].main)
// Windows high-contrast mode drops background colours: keep the bars, fills and today line visible.
const forcedFill = (color) => ({ '@media (forced-colors: active)': { forcedColorAdjust: 'none', bgcolor: color } })

/**
 * The whole row opens the project: the link's ::after covers the row, so each project is one tab
 * stop. Keyboard focus rings that whole row, as on DataTable's rows, instead of the browser's ring
 * around the name only.
 */
const stretchedLink = (theme) => ({
  fontWeight: 600,
  wordBreak: 'break-word',
  '&::after': { content: '""', position: 'absolute', inset: 0, zIndex: 1 },
  '&:focus-visible': { outline: 'none' },
  '&:focus-visible::after': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: '-2px' },
})

const gridline = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  borderLeft: 1,
  borderColor: 'divider',
  '@media (forced-colors: active)': { borderColor: 'GrayText' },
}

const todayColor = { bgcolor: 'primary.main', ...forcedFill('Highlight') }

const todayLine = {
  ...todayColor,
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 2,
  ml: '-1px',
  // A ring in the surface colour keeps the line distinct where it crosses a bar.
  boxShadow: (theme) => `0 0 0 1px ${theme.palette.background.paper}`,
}

const remainingStyle = (tone) => (theme) => ({
  borderRadius: '4px',
  overflow: 'hidden',
  bgcolor: alpha(toneColor(theme, tone), REMAINING_OPACITY),
  '@media (forced-colors: active)': { border: '1px solid CanvasText' },
})

const fillStyle = (tone) => (theme) => ({ height: '100%', bgcolor: toneColor(theme, tone), ...forcedFill('CanvasText') })

/**
 * Gantt-style timeline of projects: one row per project with its name (a link to the project) and a
 * bar from its start to its end date on a time axis shared by all rows. Bars take the health colour
 * (grey for completed or cancelled projects) with the completed share (progress_percent) filled
 * darker; month labels run along the top and a "Today" line crosses the rows when today is on the
 * axis. Every row also states its dates, health and progress in words (visibly, and as the link's
 * accessible name), so nothing depends on colour.
 *
 * projects - GET /projects items, already filtered and sorted by the page (rows keep that order).
 * today - 'YYYY-MM-DD', defaults to today (UTC).
 * ariaLabel - name of the list. emptyTitle / emptyMessage / emptyAction - shown when there are no
 * projects (as in DataTable). Loading and errors are left to the page.
 */
export default function ProjectTimeline({
  projects,
  today = todayIso(),
  ariaLabel = 'Project timeline',
  emptyTitle = 'No projects to show',
  emptyMessage,
  emptyAction,
}) {
  const isMobile = useIsMobile()
  const isPhone = useMediaQuery({ maxWidth: PHONE_MAX_WIDTH })
  const isCompact = useMediaQuery({ maxWidth: COMPACT_MAX_WIDTH })
  const maxTicks = tickLimit(isPhone, isCompact)
  const timeline = useMemo(() => buildTimeline(projects, { today, maxTicks }), [projects, today, maxTicks])

  if (!timeline.rows.length) {
    return (
      <Paper>
        <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
      </Paper>
    )
  }

  // Phones and tablets stack each name above its bar; wider screens list the names in a column.
  const columns = isMobile ? 'minmax(0, 1fr)' : `${isCompact ? 200 : 260}px minmax(0, 1fr)`
  return (
    <Paper sx={{ p: { xs: 1.5, md: 2 } }}>
      <Legend showToday={timeline.today !== null} />
      <AxisHeader ticks={timeline.ticks} today={timeline.today} columns={columns} stacked={isMobile} />
      <Box component="ul" role="list" aria-label={ariaLabel} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {timeline.rows.map((row) => (
          <TimelineRow
            key={row.project.id}
            row={row}
            ticks={timeline.ticks}
            today={timeline.today}
            columns={columns}
            stacked={isMobile}
          />
        ))}
      </Box>
    </Paper>
  )
}

function tickLimit(isPhone, isCompact) {
  if (isPhone) return 4
  return isCompact ? 6 : 10
}

/** What the colours, the darker fill and the vertical line mean. */
function Legend({ showToday }) {
  return (
    <Box
      component="ul"
      role="list"
      aria-label="Legend"
      sx={{ listStyle: 'none', m: 0, mb: 1.5, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}
    >
      {HEALTH_STATES.map((state) => (
        <LegendItem key={state.value} symbol={<Swatch tone={state.color} />}>
          {state.label}
        </LegendItem>
      ))}
      <LegendItem symbol={<Swatch tone="muted" />}>{CLOSED_LABEL}</LegendItem>
      <LegendItem symbol={<ProgressKey />}>Darker fill shows progress</LegendItem>
      {showToday && <LegendItem symbol={<TodayKey />}>Today</LegendItem>}
    </Box>
  )
}

function LegendItem({ symbol, children }) {
  return (
    <Typography component="li" variant="caption" color="textSecondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {symbol}
      {children}
    </Typography>
  )
}

function Swatch({ tone }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={(theme) => ({
        display: 'inline-block',
        flexShrink: 0,
        width: 12,
        height: 12,
        borderRadius: '3px',
        verticalAlign: '-1px',
        bgcolor: toneColor(theme, tone),
        ...forcedFill('CanvasText'),
      })}
    />
  )
}

function ProgressKey() {
  return (
    <Box component="span" aria-hidden="true" sx={[remainingStyle('muted'), { display: 'inline-flex', flexShrink: 0, width: 28, height: 12 }]}>
      <Box component="span" sx={[fillStyle('muted'), { width: '50%' }]} />
    </Box>
  )
}

function TodayKey() {
  return <Box component="span" aria-hidden="true" sx={{ ...todayColor, display: 'inline-block', flexShrink: 0, width: 2, height: 14 }} />
}

/** Month labels above the bars and the "Today" label above its line (visual only: every row states its dates). */
function AxisHeader({ ticks, today, columns, stacked }) {
  return (
    <Box aria-hidden="true" sx={{ display: 'grid', gridTemplateColumns: columns, columnGap: 2, px: 1 }}>
      {!stacked && <span />}
      <Box
        data-testid="timeline-axis"
        sx={{ position: 'relative', overflow: 'hidden', height: (today === null ? 1 : 2) * AXIS_LINE_HEIGHT }}
      >
        {ticks.map((tick) => (
          <Box key={tick.date} style={{ left: `${tick.percent}%` }} sx={gridline} />
        ))}
        {ticks
          .filter((tick) => tick.label)
          .map((tick) => (
            <Typography
              key={tick.date}
              variant="caption"
              color="textSecondary"
              data-testid="timeline-tick"
              style={{ left: `${tick.percent}%` }}
              sx={{ position: 'absolute', top: 0, pl: 0.5, lineHeight: `${AXIS_LINE_HEIGHT}px`, whiteSpace: 'nowrap' }}
            >
              {tick.label}
            </Typography>
          ))}
        {today !== null && (
          <Typography
            variant="caption"
            data-testid="timeline-today-label"
            style={{ left: `${today}%`, transform: ANCHOR_SHIFT[labelAnchor(today)] }}
            sx={{
              position: 'absolute',
              top: AXIS_LINE_HEIGHT,
              px: 0.5,
              fontWeight: 700,
              lineHeight: `${AXIS_LINE_HEIGHT}px`,
              whiteSpace: 'nowrap',
            }}
          >
            Today
          </Typography>
        )}
      </Box>
    </Box>
  )
}

function TimelineRow({ row, ticks, today, columns, stacked }) {
  const { project } = row
  return (
    <Box
      component="li"
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: columns,
        columnGap: 2,
        rowGap: 0.75,
        px: 1,
        py: 1,
        borderTop: 1,
        borderColor: 'divider',
        '&:hover, &:focus-within': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ minWidth: 0, alignSelf: 'center' }}>
        <Link component={RouterLink} to={`/projects/${project.id}`} variant="body2" aria-label={row.label} sx={stretchedLink}>
          {project.name}
        </Link>
        {/* The same words are the link's accessible name, so screen readers hear them once. */}
        <Typography component="div" variant="caption" color="textSecondary" aria-hidden="true" data-testid="timeline-details">
          <Box component="span" sx={{ display: 'block' }}>
            {row.dates}
          </Box>
          {(row.state || row.progress) && (
            <Box component="span" sx={{ display: 'block' }}>
              {row.state && (
                <Box component="span" sx={{ color: 'text.primary', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <Swatch tone={row.tone} /> {row.state}
                </Box>
              )}
              {row.state && row.progress && ' · '}
              {row.progress}
            </Box>
          )}
        </Typography>
      </Box>
      {/* Beside the names the track spans the whole row (into its padding), so the lines run unbroken. */}
      <Box aria-hidden="true" data-testid="timeline-track" sx={{ position: 'relative', minHeight: 20, my: stacked ? 0 : -1 }}>
        {ticks.map((tick) => (
          <Box key={tick.date} style={{ left: `${tick.percent}%` }} sx={gridline} />
        ))}
        {row.bar && (
          <Box
            data-testid="timeline-bar"
            data-tone={row.tone}
            style={{ left: `${row.bar.left}%`, width: `${row.bar.width}%` }}
            sx={[
              remainingStyle(row.tone),
              { position: 'absolute', top: '50%', height: BAR_HEIGHT, transform: 'translateY(-50%)' },
            ]}
          >
            <Box data-testid="timeline-progress" style={{ width: `${row.fillPercent}%` }} sx={fillStyle(row.tone)} />
          </Box>
        )}
        {today !== null && <Box data-testid="timeline-today" style={{ left: `${today}%` }} sx={todayLine} />}
      </Box>
    </Box>
  )
}

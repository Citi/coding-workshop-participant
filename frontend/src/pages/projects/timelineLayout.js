// Pure maths for the project timeline (a Gantt chart): one time axis shared by every project, the
// position of each project's bar on it, month tick labels and the "today" marker. Dates are
// 'YYYY-MM-DD' calendar dates handled as whole UTC days, like the API (see projectMetrics.js).
// Positions are percentages of the axis width, so bars scale with their row at every screen size.
import { formatDate, formatPercent } from '../../utils/format'
import { findOption, labelFor } from '../../utils/labels'
import { isClosed } from './projectMetrics'

const DAY_MS = 24 * 60 * 60 * 1000
const AVERAGE_MONTH_DAYS = 30.44
/** 'YYYY-MM-DD', optionally followed by a time ('2026-01-05T00:00:00Z'). */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/

/** Padding on each end of the axis: 3% of the projects' span, and at least 3 days. */
export const AXIS_PADDING_RATIO = 0.03
export const MIN_AXIS_PADDING_DAYS = 3
/** Shortest axis (about two months), so even a one-day project has month labels around it. */
export const MIN_AXIS_DAYS = 61
/** Narrowest bar, as a percentage of the axis, so a one-day project on a long axis stays visible. */
export const MIN_BAR_PERCENT = 1.5
/** Default number of month labels along the axis. */
export const DEFAULT_MAX_TICKS = 10
/** Months between ticks, smallest first: the first that keeps the ticks within maxTicks is used. */
const TICK_STEPS = [1, 2, 3, 6, 12, 24, 60, 120]

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

/** Percentages are rounded to 2 decimals: stable style values, far below a pixel. */
const round = (value) => Math.round(value * 100) / 100
const monthStart = (index) => Date.UTC(Math.floor(index / 12), index % 12, 1) / DAY_MS
const isNumber = (value) => value !== null && value !== '' && Number.isFinite(Number(value))

/** '2026-03-01' -> whole days since 1970-01-01 (UTC); null unless the value is a real calendar date. */
export function toDayNumber(value) {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null
  if (!match) return null
  const [year, month, day] = match.slice(1, 4).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const isReal = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return isReal ? date.getTime() / DAY_MS : null
}

/** Whole days since 1970-01-01 (UTC) -> 'YYYY-MM-DD'. */
export function toIsoDate(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)
}

/** A project's schedule in whole days { start, end } (end inclusive); null when a date is missing or invalid. */
export function projectSpan(project) {
  const start = toDayNumber(project?.start_date)
  const end = toDayNumber(project?.end_date)
  return start === null || end === null || end < start ? null : { start, end }
}

/**
 * The axis shared by a list of projects: from the earliest start to the end of the latest end date,
 * padded on both ends and at least MIN_AXIS_DAYS long (a short range is widened evenly on both sides).
 * Returns { start, end, days } in whole days (end exclusive), or null when no project has valid dates.
 * Projects without valid dates are left out.
 */
export function timelineAxis(projects) {
  const spans = (projects || []).map(projectSpan).filter(Boolean)
  if (!spans.length) return null
  const first = spans.reduce((earliest, span) => Math.min(earliest, span.start), Infinity)
  const last = spans.reduce((latest, span) => Math.max(latest, span.end), -Infinity) + 1
  const padding = Math.max(MIN_AXIS_PADDING_DAYS, Math.round((last - first) * AXIS_PADDING_RATIO))
  const shortBy = Math.max(0, MIN_AXIS_DAYS - (last - first + 2 * padding))
  const start = first - padding - Math.floor(shortBy / 2)
  const end = last + padding + Math.ceil(shortBy / 2)
  return { start, end, days: end - start }
}

/** Where the start of a day sits on the axis, as a percentage clamped to 0-100. */
function percentOf(day, axis) {
  return Math.min(100, Math.max(0, ((day - axis.start) / axis.days) * 100))
}

/**
 * The bar of a span: { left, width } as percentages of the axis. Clamped to the axis, at least
 * minWidth wide (moved left if needed so it stays inside), and null when the span is missing or
 * entirely outside the axis.
 */
export function barPosition(span, axis, minWidth = MIN_BAR_PERCENT) {
  if (!span || !axis || span.end < axis.start || span.start >= axis.end) return null
  let left = round(percentOf(span.start, axis))
  let width = round(round(percentOf(span.end + 1, axis)) - left)
  if (width < minWidth) {
    width = Math.min(minWidth, 100)
    left = round(Math.min(left, 100 - width))
  }
  return { left, width }
}

/** Where the middle of `today` sits on the axis (percent), or null when it is outside the axis or invalid. */
export function todayPosition(today, axis) {
  const day = toDayNumber(today)
  if (day === null || !axis || day < axis.start || day >= axis.end) return null
  return round(((day + 0.5 - axis.start) / axis.days) * 100)
}

/** The first day of every month on the axis: [{ index (year * 12 + month), day }]. */
function monthStarts(axis) {
  const first = new Date(axis.start * DAY_MS)
  const months = []
  let index = first.getUTCFullYear() * 12 + first.getUTCMonth() + (first.getUTCDate() === 1 ? 0 : 1)
  for (let day = monthStart(index); day < axis.end; day = monthStart(index)) {
    months.push({ index, day })
    index += 1
  }
  return months
}

function tickStep(months, maxTicks) {
  const fits = (step) => months.filter((month) => month.index % step === 0).length <= maxTicks
  // Past TICK_STEPS (a range of centuries), whole numbers of years that still fit.
  return TICK_STEPS.find(fits) ?? 12 * Math.ceil(months.length / (12 * maxTicks))
}

function tickLabel(month, step, withYear) {
  const year = String(Math.floor(month.index / 12))
  if (step >= 12) return year
  const name = monthFormatter.format(new Date(month.day * DAY_MS))
  return withYear || month.index % 12 === 0 ? `${name} ${year}` : name
}

/**
 * Month ticks along the axis: [{ date, percent, label }]. Every month when they fit, otherwise every
 * 2nd, 3rd, 6th or 12th month (and so on) so that at most maxTicks remain, on calendar boundaries
 * (quarters start in Jan, Apr, Jul and Oct). Labels read 'Jan 2026', 'Feb', ... with the year on the
 * first label and on January, or just '2026' once ticks are a year or more apart. A tick too close
 * to the end of the axis for its label keeps its gridline with an empty label.
 */
export function monthTicks(axis, maxTicks = DEFAULT_MAX_TICKS) {
  if (!axis) return []
  const months = monthStarts(axis)
  const step = tickStep(months, Math.max(1, Math.floor(maxTicks) || 1))
  const minRoomDays = (step * AVERAGE_MONTH_DAYS) / 2
  let yearShown = false
  return months
    .filter((month) => month.index % step === 0)
    .map((month) => {
      const label = axis.end - month.day >= minRoomDays ? tickLabel(month, step, !yearShown) : ''
      if (label) yearShown = true
      return { date: toIsoDate(month.day), percent: round(((month.day - axis.start) / axis.days) * 100), label }
    })
}

/** How to align a label on a marker at `percent` so it stays inside the axis: 'start' | 'middle' | 'end'. */
export function labelAnchor(percent, edge = 8) {
  if (percent < edge) return 'start'
  return percent > 100 - edge ? 'end' : 'middle'
}

/** A progress value as 0-100 for the bar's darker fill (missing or invalid values count as 0). */
export function clampPercent(value) {
  return isNumber(value) ? Math.min(100, Math.max(0, Number(value))) : 0
}

/** Colour of a project's bar: its health colour (success | warning | error), or 'muted' when it is completed or cancelled. */
export function barTone(project) {
  if (isClosed(project.status)) return 'muted'
  return findOption('health', project.health)?.color ?? 'muted'
}

/** The health label, or the status for completed/cancelled projects (they have no health). */
function stateLabel(project) {
  if (!isClosed(project.status) && project.health) return labelFor('health', project.health)
  return project.status ? labelFor('project', project.status) : ''
}

/**
 * A row in words, so the timeline never relies on colour or position alone:
 *   { dates: 'Jan 5, 2026 – Mar 30, 2026', state: 'At risk', progress: '40% complete',
 *     label: 'Website revamp: Jan 5, 2026 – Mar 30, 2026 · At risk · 40% complete' }
 * A one-day project shows a single date; invalid dates read 'Dates not set'. Missing parts are left out.
 */
export function timelineText(project) {
  const span = projectSpan(project)
  let dates = 'Dates not set'
  if (span) {
    const start = formatDate(toIsoDate(span.start))
    dates = span.start === span.end ? start : `${start} – ${formatDate(toIsoDate(span.end))}`
  }
  const state = stateLabel(project)
  const progress = isNumber(project.progress_percent) ? `${formatPercent(project.progress_percent)} complete` : ''
  const label = `${project.name}: ${[dates, state, progress].filter(Boolean).join(' · ')}`
  return { dates, state, progress, label }
}

/**
 * Everything ProjectTimeline draws, rows in the order of `projects`:
 *   { axis, ticks, today: percent | null,
 *     rows: [{ project, bar: { left, width } | null, tone, fillPercent, dates, state, progress, label }] }
 */
export function buildTimeline(projects, { today, maxTicks } = {}) {
  const items = projects || []
  const axis = timelineAxis(items)
  return {
    axis,
    ticks: monthTicks(axis, maxTicks),
    today: todayPosition(today, axis),
    rows: items.map((project) => ({
      project,
      bar: barPosition(projectSpan(project), axis),
      tone: barTone(project),
      fillPercent: clampPercent(project.progress_percent),
      ...timelineText(project),
    })),
  }
}

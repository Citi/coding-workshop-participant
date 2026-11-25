import { relativeDue } from '../../utils/format'
// Pure helpers for the project screens: counts, schedule and completion maths.
// Dates are 'YYYY-MM-DD' strings compared as calendar dates (UTC), like the API.

const DAY_MS = 24 * 60 * 60 * 1000
const CLOSED_STATUSES = new Set(['completed', 'cancelled'])

/** Whole calendar days from one date to another (negative when `to` is earlier). */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** Share of the schedule that has passed, as used by the API's "schedule slippage" health rule. */
export function elapsedPercent(startDate, endDate, today) {
  if (today <= startDate) return 0
  if (today >= endDate) return 100
  // Here start < today < end, so the span is at least two days.
  return Math.round((daysBetween(startDate, today) * 100) / daysBetween(startDate, endDate))
}

/**
 * Before the start date, worded like every other date label: 'Starts tomorrow', 'Starts in 5 days',
 * 'Starts in 2 weeks', 'Starts in 3 months'. null from the start date on, when the end date's own
 * urgency label ('Ends in 3 weeks', '2 days overdue') says how much time is left instead.
 */
export function startsInLabel(startDate, today) {
  const urgency = relativeDue(startDate, { kind: 'start', today })
  return urgency && urgency.days > 0 ? urgency.label : null
}

/** Completed and cancelled projects have no health and no remaining schedule. */
export function isClosed(status) {
  return CLOSED_STATUSES.has(status)
}

/** completed / total as a whole percentage (0 when there is nothing to complete). */
export function completionPercent(completed, total) {
  return total ? Math.round((completed * 100) / total) : 0
}

/** PercentBar label for budget use: the API sends null when money was spent against a zero budget. */
export function budgetUsedLabel(percent) {
  return percent === null ? 'No budget' : undefined
}

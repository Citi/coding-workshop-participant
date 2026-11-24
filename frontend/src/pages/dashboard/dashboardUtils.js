// Pure helpers for the dashboard (docs/API.md › Dashboard): headline figures, list wording and the
// snapshot time. Its date is a 'YYYY-MM-DD' calendar date in UTC, like the API's "today".
import { budgetColor, formatCurrency, todayIso } from '../../utils/format'
import { HEALTH_STATES, PROJECT_STATUSES } from '../../utils/labels'
import { countLabel } from '../../utils/text'

/** Rows a dashboard list shows before its "Show N more" button. */
export const VISIBLE_ROWS = 5

const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

function parseTimestamp(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

/**
 * When the snapshot was taken, in the viewer's time zone: '2:05 PM' when it is from today,
 * 'Nov 23, 2026, 2:05 PM' when older, '' when unknown.
 */
export function formatUpdatedAt(value, now = new Date()) {
  const date = parseTimestamp(value)
  if (!date) return ''
  return (date.toDateString() === now.toDateString() ? timeFormatter : dateTimeFormatter).format(date)
}

/**
 * The API's "today" for a snapshot (the UTC date of generated_at). The dashboard words due and end
 * dates against it (<DueDate today={...}>), so "3 days overdue" matches the lists the API sent.
 */
export function snapshotDate(generatedAt) {
  const date = parseTimestamp(generatedAt)
  return date ? date.toISOString().slice(0, 10) : todayIso()
}

/** Open projects that need attention: at risk, overdue and both together. */
export function riskSummary(byHealth = {}) {
  const atRisk = byHealth.at_risk || 0
  const overdue = byHealth.overdue || 0
  return { atRisk, overdue, total: atRisk + overdue }
}

/** Palette colour for the at-risk count: red when a project is overdue, amber when one is at risk. */
export function riskTone({ atRisk, overdue }) {
  if (overdue) return 'error'
  if (atRisk) return 'warning'
  return undefined
}

/** Palette colour for portfolio budget use: amber above 80%, red above 100%, none otherwise. */
export function budgetTone(percent) {
  const color = budgetColor(percent)
  return color === 'primary' ? undefined : color
}

/** One row per project status, in workflow order, with its count and share of all projects. */
export function statusBreakdown(byStatus = {}, total = 0) {
  return PROJECT_STATUSES.map(({ value, color }) => {
    const count = byStatus[value] || 0
    return { value, color, count, percent: total ? Math.round((count * 100) / total) : 0 }
  })
}

/** { value, label, color, count } for each health state (only open projects have a health). */
export function healthBreakdown(byHealth = {}) {
  return HEALTH_STATES.map((state) => ({ ...state, count: byHealth[state.value] || 0 }))
}

const money = (value) => formatCurrency(value, { whole: true })

/** '$61,000 of $150,000' */
export function spentOfPlanned(spent, planned) {
  return `${money(spent)} of ${money(planned)}`
}

/** '$89,000 left' | '$6,000 over budget' */
export function remainingLabel(remaining) {
  return remaining < 0 ? `${money(-remaining)} over budget` : `${money(remaining)} left`
}

/** 'Sales · 3 people' */
export function projectSubtitle(project) {
  return `${project.department} · ${countLabel(project.team_size, 'person', 'people')}`
}

/** A project's triggered health rules as one sentence list. */
export function joinReasons(reasons) {
  return (reasons || []).join('; ')
}

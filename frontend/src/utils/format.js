// Formatting helpers so dates, money and percentages look the same everywhere.
import { countLabel } from './text'

const DAY_MS = 24 * 60 * 60 * 1000
const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const wholeCurrencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/**
 * 'YYYY-MM-DD' (read as midnight UTC) or a full timestamp -> Date; null when missing or invalid.
 * A calendar date must exist: the browser would read '2026-02-30' as March 2, so it counts as invalid.
 */
function toDate(value) {
  if (!value) return null
  const text = String(value)
  const isCalendarDate = text.length === 10
  const date = new Date(isCalendarDate ? `${text}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return null
  return isCalendarDate && date.toISOString().slice(0, 10) !== text ? null : date
}

/** '2026-03-01' -> 'Mar 1, 2026' (dates are calendar dates, formatted in UTC to avoid day shifts). */
export function formatDate(value) {
  const date = toDate(value)
  return date ? dateFormatter.format(date) : '—'
}

/** 1234.5 -> '$1,234.5' ; { whole: true } -> '$1,235' */
export function formatCurrency(value, { whole = false } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (Number.isNaN(number)) return '—'
  return (whole ? wholeCurrencyFormatter : currencyFormatter).format(number)
}

/** 40.7 -> '40.7%' ; null -> '—' */
export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value)}%`
}

/** Today's date as 'YYYY-MM-DD' (UTC, matching the API's business date). */
export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** Colour for budget consumption: red above 100%, amber above 80%. */
export function budgetColor(percent) {
  if (percent === null || percent === undefined || percent > 100) return 'error'
  if (percent > 80) return 'warning'
  return 'primary'
}

/** Days since 1970-01-01 of the UTC calendar date of `value`; null when missing or invalid. */
function utcDayNumber(value) {
  const date = toDate(value)
  return date ? Math.floor(date.getTime() / DAY_MS) : null
}

/** The verb each kind of date is worded with: "Due in 3 days", "Ends tomorrow", "Starts in 2 weeks". */
const VERBS = { due: 'Due', end: 'Ends', start: 'Starts' }

/** 'today', 'tomorrow', 'in 5 days', 'in 2 weeks' (from 14 days), 'in 2 months' (from 60 days). */
function timeUntil(days) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${countLabel(days, 'day')}`
  if (days < 60) return `in ${countLabel(Math.floor(days / 7), 'week')}`
  return `in ${countLabel(Math.floor(days / 30), 'month')}`
}

function urgencyLabel(days, verb) {
  if (days < 0) return `${countLabel(-days, 'day')} overdue`
  return verb ? `${verb} ${timeUntil(days)}` : timeUntil(days)
}

function urgencyTone(days) {
  if (days < 0) return 'overdue'
  return days <= 7 ? 'soon' : 'later'
}

/**
 * How close a date is, for urgency labels next to due, end and start dates. With today = '2026-11-24':
 *   relativeDue('2026-11-27', { today })                -> { label: 'Due in 3 days', tone: 'soon', days: 3 }
 *   relativeDue('2026-11-20', { today })                -> { label: '4 days overdue', tone: 'overdue', days: -4 }
 *   relativeDue('2027-01-23', { kind: 'end', today })   -> { label: 'Ends in 2 months', tone: 'later', days: 60 }
 *   relativeDue('2026-11-25', { kind: 'start', today }) -> { label: 'Starts tomorrow', tone: 'soon', days: 1 }
 *   relativeDue('2026-12-08', { verb: false, today })   -> { label: 'in 2 weeks', tone: 'later', days: 14 }
 * `days` is the date minus today in whole UTC calendar days; tone is 'overdue' (in the past), 'soon'
 * (today to 7 days ahead) or 'later'. verb: false leaves out "Due" / "Ends" / "Starts", for a line
 * that already says it ("Due Dec 8, 2026 · in 2 weeks"). Returns null for finished work (done), a
 * missing/invalid date, or a start date that has passed (a start is never "overdue").
 * Use <DueDate> (components/DueDate.jsx) to show it, or <UrgencyLabel urgency={...} variant="inherit" />
 * from the same file inside a line of text.
 */
export function relativeDue(dateIso, { kind = 'due', verb = true, today = todayIso(), done = false } = {}) {
  if (done) return null
  const dateDay = utcDayNumber(dateIso)
  const todayDay = utcDayNumber(today)
  if (dateDay === null || todayDay === null) return null
  const days = dateDay - todayDay
  if (kind === 'start' && days < 0) return null
  return { label: urgencyLabel(days, verb ? VERBS[kind] || VERBS.due : ''), tone: urgencyTone(days), days }
}

/**
 * Display formatters.
 *
 * Every one tolerates null/undefined and returns an em dash rather than
 * throwing or printing "Invalid Date" -- API records routinely have optional
 * dates and amounts, and a table cell is not the place to crash.
 */

const EMPTY = '—';

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATETIME_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "04 Mar 2026" */
export function formatDate(value) {
  const date = toDate(value);
  return date ? DATE_FMT.format(date) : EMPTY;
}

/** "04 Mar 2026, 14:30" */
export function formatDateTime(value) {
  const date = toDate(value);
  return date ? DATETIME_FMT.format(date) : EMPTY;
}

/** "04 Mar 2026 – 30 Jun 2026", collapsing when either end is missing. */
export function formatDateRange(start, end) {
  const from = toDate(start);
  const to = toDate(end);
  if (!from && !to) return EMPTY;
  if (!to) return `${formatDate(from)} – ongoing`;
  if (!from) return `until ${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** The value an <input type="date"> expects: "2026-03-04". */
export function toDateInputValue(value) {
  const date = toDate(value);
  if (!date) return '';
  // Built from local parts, not toISOString(): that converts to UTC first and
  // can shift the date by a day for anyone east or west of Greenwich.
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whole days from today; negative when the date has passed. */
export function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  const startOfDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
}

/** "in 12 days" / "3 days ago" / "today" */
export function formatRelativeDays(value) {
  const days = daysUntil(value);
  if (days === null) return EMPTY;
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  const past = Math.abs(days);
  return `${past} day${past === 1 ? '' : 's'} ago`;
}

/** "$1,250,000" */
export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined || amount === '') return EMPTY;
  const value = Number(amount);
  if (Number.isNaN(value)) return EMPTY;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Shortens large figures for dashboard tiles: "1.3M", "820K". */
export function formatCompactCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined || amount === '') return EMPTY;
  const value = Number(amount);
  if (Number.isNaN(value)) return EMPTY;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Formats a ratio as a percentage. Pass a 0-1 fraction (the default) or set
 * `alreadyPercent` when the API hands back 0-100.
 */
export function formatPercent(value, { alreadyPercent = false, decimals = 0 } = {}) {
  if (value === null || value === undefined || value === '') return EMPTY;
  const number = Number(value);
  if (Number.isNaN(number)) return EMPTY;
  const fraction = alreadyPercent ? number / 100 : number;
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(fraction);
}

/** Safe division for "spent / planned" style ratios; 0 when the divisor is 0. */
export function ratio(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!bottom || Number.isNaN(top) || Number.isNaN(bottom)) return 0;
  return top / bottom;
}

/** "AS" for "Ada Sanders" -- avatar fallbacks. */
export function initials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** "not_started" -> "Not Started", for any value with no explicit label. */
export function humanise(value) {
  if (!value) return EMPTY;
  return String(value)
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

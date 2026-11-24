/**
 * Formatting helpers for money, percentages and dates.
 * The API sends money as decimal strings ("400000.00") and dates as ISO strings.
 */

/** The single currency of the platform (multi-currency is out of scope). */
export const CURRENCY = 'USD';

/** Locale used for every number and date shown in the UI. */
export const LOCALE = 'en-US';

/** Shown in place of a missing value. */
export const EMPTY_VALUE = '—';

const moneyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const compactMoneyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const numberFormatter = new Intl.NumberFormat(LOCALE);
const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Convert an API number (number or decimal string) to a JavaScript number.
 * @param {number|string|null|undefined} value - Raw value.
 * @returns {number|null} The number, or null when missing or not numeric.
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Format an amount in the platform currency.
 * @param {number|string|null|undefined} value - Amount, e.g. "400000.00".
 * @param {{compact?: boolean}} [options] - `compact` gives "$400K" style output.
 * @returns {string} Formatted amount, or an em dash when missing.
 */
export function formatMoney(value, { compact = false } = {}) {
  const amount = toNumber(value);
  if (amount === null) {
    return EMPTY_VALUE;
  }
  return (compact ? compactMoneyFormatter : moneyFormatter).format(amount);
}

/**
 * Format a percentage that the API already rounded (e.g. 75 -> "75.0%").
 * @param {number|string|null|undefined} value - Percentage points.
 * @param {{digits?: number}} [options] - Decimal places (default 1).
 * @returns {string} Formatted percentage, or an em dash when missing.
 */
export function formatPct(value, { digits = 1 } = {}) {
  const number = toNumber(value);
  if (number === null) {
    return EMPTY_VALUE;
  }
  return `${number.toFixed(digits)}%`;
}

/**
 * Format a plain count with grouping separators.
 * @param {number|string|null|undefined} value - Number to format.
 * @returns {string} Formatted number, or an em dash when missing.
 */
export function formatNumber(value) {
  const number = toNumber(value);
  return number === null ? EMPTY_VALUE : numberFormatter.format(number);
}

/**
 * Format an ISO calendar date ("2026-11-25") without time-zone drift.
 * @param {string|null|undefined} value - ISO date or date-time string.
 * @returns {string} Date such as "Nov 25, 2026", or an em dash when missing.
 */
export function formatDate(value) {
  if (!value) {
    return EMPTY_VALUE;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) {
    return String(value);
  }
  const [, year, month, day] = match;
  return dateFormatter.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

/**
 * Format a timestamp (such as `created_at`) in the viewer's local time.
 * @param {string|null|undefined} value - ISO date-time string.
 * @returns {string} Date and time, or an em dash when missing or invalid.
 */
export function formatDateTime(value) {
  if (!value) {
    return EMPTY_VALUE;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateTimeFormatter.format(date);
}

/**
 * Field validators and payload helpers for the project, deliverable, budget entry and
 * dependency forms. They run before submit; the server validates again and its per-field
 * `details` are shown next to the same fields.
 */
import { CURRENCY, LOCALE } from '../../utils/format.js';

/** Largest whole-number part the API accepts for money: NUMERIC(14, 2) leaves 12 digits. */
export const MONEY_MAX_INTEGER_DIGITS = 12;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONEY = /^\d+(\.\d+)?$/;

/**
 * The platform currency's symbol, for input adornments (single currency, spec 0).
 * @returns {string} Symbol such as "$", or the currency code when the locale has none.
 */
export function currencySymbol() {
  try {
    const part = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY })
      .formatToParts(0)
      .find((item) => item.type === 'currency');
    return part ? part.value : CURRENCY;
  } catch {
    return CURRENCY;
  }
}

/**
 * Trim a text value; null and undefined become ''.
 * @param {unknown} value - Raw input.
 * @returns {string} Trimmed text.
 */
export function cleanText(value) {
  return String(value ?? '').trim();
}

/**
 * Trimmed text, or null when blank (how the API stores empty optional text).
 * @param {unknown} value - Raw input.
 * @returns {string|null} Text or null.
 */
export function textOrNull(value) {
  const text = cleanText(value);
  return text ? text : null;
}

/**
 * A select's string value as a record id, or null when nothing is chosen.
 * @param {unknown} value - Select value such as "3" or ''.
 * @returns {number|null} Id or null.
 */
export function idOrNull(value) {
  const text = cleanText(value);
  return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * Check a `YYYY-MM-DD` string names a real calendar date.
 * @param {string} value - Date input value.
 * @returns {boolean} True for valid dates such as 2026-11-25.
 */
export function isIsoDate(value) {
  const match = ISO_DATE.exec(cleanText(value));
  if (!match) {
    return false;
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Validate a required single-line text field.
 * @param {unknown} value - Input value.
 * @param {{missing: string, max: number, label: string}} rules - Messages and limit.
 * @returns {string|null} Error message, or null when valid.
 */
export function requiredTextError(value, { missing, max, label }) {
  const text = cleanText(value);
  if (!text) {
    return missing;
  }
  return text.length > max ? `${label} must be at most ${max} characters.` : null;
}

/**
 * Validate an optional text field's length.
 * @param {unknown} value - Input value.
 * @param {{max: number, label: string}} rules - Limit and field name.
 * @returns {string|null} Error message, or null when valid.
 */
export function optionalTextError(value, { max, label }) {
  return cleanText(value).length > max ? `${label} must be at most ${max} characters.` : null;
}

/**
 * Validate a date input.
 * @param {unknown} value - Input value (`YYYY-MM-DD` or '').
 * @param {{required?: boolean, missing?: string}} [rules] - Whether it is required and the message.
 * @returns {string|null} Error message, or null when valid.
 */
export function dateError(value, { required = false, missing = 'Choose a date.' } = {}) {
  const text = cleanText(value);
  if (!text) {
    return required ? missing : null;
  }
  return isIsoDate(text) ? null : 'Enter a valid date.';
}

/**
 * Remove grouping characters a person may type in an amount ("150,000" -> "150000").
 * @param {unknown} value - Input value.
 * @returns {string} Digits with an optional decimal part.
 */
export function normaliseMoneyInput(value) {
  return cleanText(value).replace(/[,\s_]/g, '');
}

/**
 * Validate a money amount against the API's NUMERIC(14, 2) limits.
 * @param {unknown} value - Input value.
 * @param {{allowZero?: boolean, label?: string}} [rules] - Whether 0 is allowed and the field name.
 * @returns {string|null} Error message, or null when valid.
 */
export function moneyError(value, { allowZero = false, label = 'Amount' } = {}) {
  const text = normaliseMoneyInput(value);
  if (!text) {
    return `Enter the ${label.toLowerCase()}, for example 150000 or 1500.50.`;
  }
  if (!MONEY.test(text)) {
    return `${label} must be a number such as 150000 or 1500.50.`;
  }
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > 2) {
    return `${label} can have at most 2 decimal places.`;
  }
  if (whole.replace(/^0+(?=\d)/, '').length > MONEY_MAX_INTEGER_DIGITS) {
    return `${label} is too large.`;
  }
  const amount = Number(text);
  if (!allowZero && amount <= 0) {
    return `${label} must be greater than 0.`;
  }
  return null;
}

/**
 * Format a valid amount the way the API stores it: two decimals, no grouping ("1500.50").
 * @param {unknown} value - Amount that passed `moneyError`.
 * @returns {string} Decimal string.
 */
export function toMoneyString(value) {
  const text = normaliseMoneyInput(value);
  const [whole, fraction = ''] = text.split('.');
  const digits = whole.replace(/^0+(?=\d)/, '') || '0';
  return `${digits}.${fraction.padEnd(2, '0')}`;
}

/**
 * Validate a whole-number percentage.
 * @param {unknown} value - Input value.
 * @param {{label: string}} rules - Field name for the message.
 * @returns {string|null} Error message, or null when valid.
 */
export function percentError(value, { label }) {
  const text = cleanText(value);
  if (!/^\d{1,3}$/.test(text) || Number(text) > 100) {
    return `${label} must be a whole number from 0 to 100.`;
  }
  return null;
}

/**
 * Keep only the fields whose value differs from the original record (for PUT bodies).
 * @param {Record<string, unknown>} next - Payload built from the form.
 * @param {Record<string, unknown>} original - Payload built from the record before editing.
 * @returns {Record<string, unknown>} Changed fields only; empty when nothing changed.
 */
export function changedFields(next, original) {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => original[key] !== value));
}

/**
 * Drop error entries that are null, leaving `{field: message}` for invalid fields only.
 * @param {Record<string, string|null>} errors - Candidate errors.
 * @returns {Record<string, string>} Errors that apply.
 */
export function compactErrors(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => Boolean(message)));
}

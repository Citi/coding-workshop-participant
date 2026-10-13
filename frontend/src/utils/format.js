/** Formatting helpers shared across pages. */

export const HOURS_PER_DAY = 8;

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/**
 * Parse a YYYY-MM-DD string as a local date (avoids UTC off-by-one).
 * @param {string} value
 * @returns {Date|null}
 */
export function parseDate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** @param {number|string} value @returns {string} */
export const formatMoney = (value) => currency.format(Number(value || 0));

/** @param {number|string} value @returns {string} */
export const formatNumber = (value) => number.format(Number(value || 0));

/** @param {number|string} hours @returns {string} e.g. "36 h" */
export const formatHours = (hours) => `${number.format(Number(hours || 0))} h`;

/** @param {number|string} hours @returns {string} e.g. "4.5 days" */
export const formatDays = (hours) => {
  const days = Number(hours || 0) / HOURS_PER_DAY;
  return `${number.format(days)} ${days === 1 ? 'day' : 'days'}`;
};

/** @param {string} value ISO date @returns {string} */
export const formatDate = (value) => (value ? dateFmt.format(parseDate(value)) : '—');

/** @param {string} value ISO date @returns {string} */
export const formatShortDate = (value) => (value ? shortDate.format(parseDate(value)) : '—');

/** @returns {string} Today's date as YYYY-MM-DD in local time. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const PROJECT_STATUS = {
  planned: { label: 'Planned', color: 'default' },
  active: { label: 'Active', color: 'primary' },
  on_hold: { label: 'On hold', color: 'warning' },
  completed: { label: 'Completed', color: 'success' },
};

export const MILESTONE_STATUS = {
  not_started: { label: 'Not started', color: 'default' },
  in_progress: { label: 'In progress', color: 'primary' },
  completed: { label: 'Completed', color: 'success' },
};

export const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', employee: 'Employee' };

/** TextField slotProps for selects whose empty option ("Any…") should show as a value, not a placeholder. */
export const SHOW_EMPTY_OPTION = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

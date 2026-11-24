/**
 * Helpers for the capacity page: load colours and readable date windows.
 */
import { LOCALE, formatDate } from '../../utils/format.js';

/** Load above which a person is over-allocated (spec section 9.2). */
export const FULL_LOAD = 100;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const monthDayFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function utcDate(value) {
  const match = ISO_DATE.exec(String(value ?? ''));
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

/**
 * Colour of a person's load bar: error above 100%, warning at exactly 100%.
 * The load is always printed next to the bar, so the colour is never the only signal.
 * @param {number|null|undefined} load - Allocation load in percent.
 * @returns {'error'|'warning'|'primary'} MUI colour name.
 */
export function loadTone(load) {
  if (typeof load === 'number' && load > FULL_LOAD) {
    return 'error';
  }
  return load === FULL_LOAD ? 'warning' : 'primary';
}

/**
 * Describe an inclusive date window, e.g. "Nov 22, 2026 to Dec 6, 2026".
 * @param {string} start - First day (ISO date).
 * @param {string} end - Last day (ISO date).
 * @returns {string} Readable window; a single day when both dates match.
 */
export function formatWindow(start, end) {
  if (start && start === end) {
    return formatDate(start);
  }
  return `${formatDate(start)} to ${formatDate(end)}`;
}

/**
 * Describe an inclusive date window compactly for table cells: "Nov 22 – Dec 6, 2026", with
 * the year written once when both days share it. A no-break space keeps the dash on the first
 * line when the cell wraps.
 * @param {string} start - First day (ISO date).
 * @param {string} end - Last day (ISO date).
 * @returns {string} Compact window; a single day when both dates match.
 */
export function formatShortWindow(start, end) {
  const first = utcDate(start);
  const last = utcDate(end);
  if (!first || !last) {
    return formatWindow(start, end);
  }
  if (first.getTime() === last.getTime()) {
    return formatDate(start);
  }
  const from = first.getUTCFullYear() === last.getUTCFullYear() ? monthDayFormatter.format(first) : formatDate(start);
  return `${from}\u00a0– ${formatDate(end)}`;
}

/**
 * Name what an allocation is for: its deliverable, or the project as a whole.
 * @param {{deliverable_title?: string|null}} allocation - Allocation or contributing allocation.
 * @returns {string} Deliverable title, or "Project level".
 */
export function allocationTarget(allocation) {
  return allocation?.deliverable_title || 'Project level';
}

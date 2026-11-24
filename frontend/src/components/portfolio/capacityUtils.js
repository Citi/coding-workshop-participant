/**
 * Helpers for the capacity page: load colours and readable date windows.
 */
import { formatDate } from '../../utils/format.js';

/** Load above which a person is over-allocated (spec section 9.2). */
export const FULL_LOAD = 100;

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
 * Name what an allocation is for: its deliverable, or the project as a whole.
 * @param {{deliverable_title?: string|null}} allocation - Allocation or contributing allocation.
 * @returns {string} Deliverable title, or "Project level".
 */
export function allocationTarget(allocation) {
  return allocation?.deliverable_title || 'Project level';
}

/**
 * Domain constants shared across the UI. Values mirror the API and database
 * (spec sections 6 and 7); labels are the words users read.
 */

/** Product name shown in the app bar and the document title. */
export const APP_NAME = 'ACME Project Intelligence';

/** User roles, most privileged first. */
export const ROLES = Object.freeze(['ADMIN', 'PM', 'LEAD', 'VIEWER']);

/** Rubric names for roles (spec section 1). */
export const ROLE_LABELS = Object.freeze({
  ADMIN: 'Admin',
  PM: 'Manager',
  LEAD: 'Contributor',
  VIEWER: 'Viewer',
});

export const PROJECT_STATUSES = Object.freeze(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
export const DELIVERABLE_STATUSES = Object.freeze(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE']);
export const CAPACITY_STATUSES = Object.freeze(['OVER_ALLOCATED', 'FULLY_ALLOCATED', 'AVAILABLE']);
export const RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const BUDGET_CATEGORIES = Object.freeze(['LABOR', 'SOFTWARE', 'HARDWARE', 'VENDOR', 'TRAVEL', 'OTHER']);
export const AUDIT_ACTIONS = Object.freeze(['CREATE', 'UPDATE', 'DELETE']);
export const AUDIT_ENTITY_TYPES = Object.freeze([
  'department',
  'user',
  'project',
  'deliverable',
  'dependency',
  'allocation',
  'budget_entry',
]);

/** Human-readable label for every status-like value the API returns. */
export const STATUS_LABELS = Object.freeze({
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  OVER_ALLOCATED: 'Over-allocated',
  FULLY_ALLOCATED: 'Fully allocated',
  AVAILABLE: 'Available',
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
});

export const RISK_LABELS = Object.freeze({
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
});

export const CATEGORY_LABELS = Object.freeze({
  LABOR: 'Labor',
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  VENDOR: 'Vendor',
  TRAVEL: 'Travel',
  OTHER: 'Other',
});

export const ENTITY_TYPE_LABELS = Object.freeze({
  department: 'Department',
  user: 'User',
  project: 'Project',
  deliverable: 'Deliverable',
  dependency: 'Dependency',
  allocation: 'Allocation',
  budget_entry: 'Budget entry',
});

/** Page sizes offered by tables; the API caps `limit` at 200. */
export const PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100]);
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Turn an API enum such as `ON_HOLD` into readable text ("On hold").
 * Used as a fallback when a value has no explicit label.
 * @param {string|null|undefined} value - Enum value from the API.
 * @returns {string} Readable label, or an empty string for empty input.
 */
export function humanize(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const text = String(value).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Build `{ value, label }` options for select inputs from enum values.
 * @param {readonly string[]} values - Enum values in display order.
 * @param {Record<string, string>} [labels] - Optional label for each value.
 * @returns {{value: string, label: string}[]} Options for FilterBar or a select.
 */
export function toOptions(values, labels = {}) {
  return values.map((value) => ({ value, label: labels[value] ?? humanize(value) }));
}

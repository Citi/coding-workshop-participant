// Display labels and chip colours for every enum in the API (single source for the whole UI).

export const PROJECT_STATUSES = [
  { value: 'planned', label: 'Planned', color: 'default' },
  { value: 'active', label: 'Active', color: 'primary' },
  { value: 'on_hold', label: 'On hold', color: 'warning' },
  { value: 'completed', label: 'Completed', color: 'success' },
  { value: 'cancelled', label: 'Cancelled', color: 'default' },
]

export const DELIVERABLE_STATUSES = [
  { value: 'not_started', label: 'Not started', color: 'default' },
  { value: 'in_progress', label: 'In progress', color: 'primary' },
  { value: 'blocked', label: 'Blocked', color: 'error' },
  { value: 'completed', label: 'Completed', color: 'success' },
]

export const HEALTH_STATES = [
  { value: 'on_track', label: 'On track', color: 'success' },
  { value: 'at_risk', label: 'At risk', color: 'warning' },
  { value: 'overdue', label: 'Overdue', color: 'error' },
]

export const EXPENSE_CATEGORIES = [
  { value: 'labor', label: 'Labor', color: 'default' },
  { value: 'software', label: 'Software', color: 'default' },
  { value: 'hardware', label: 'Hardware', color: 'default' },
  { value: 'travel', label: 'Travel', color: 'default' },
  { value: 'other', label: 'Other', color: 'default' },
]

export const ROLES = [
  { value: 'admin', label: 'Admin', color: 'secondary' },
  { value: 'manager', label: 'Manager', color: 'primary' },
  { value: 'contributor', label: 'Contributor', color: 'info' },
  { value: 'viewer', label: 'Viewer', color: 'default' },
]

const KINDS = {
  project: PROJECT_STATUSES,
  deliverable: DELIVERABLE_STATUSES,
  health: HEALTH_STATES,
  category: EXPENSE_CATEGORIES,
  role: ROLES,
}

/** Find the { value, label, color } entry for an enum value of a given kind. */
export function findOption(kind, value) {
  return (KINDS[kind] || []).find((option) => option.value === value) || null
}

export function labelFor(kind, value) {
  return findOption(kind, value)?.label ?? (value ? String(value) : '—')
}

/** [{ value, label }] for selects and filters. */
export function optionsFor(kind) {
  return (KINDS[kind] || []).map(({ value, label }) => ({ value, label }))
}

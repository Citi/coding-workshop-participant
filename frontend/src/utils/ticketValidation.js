/**
 * Client-side checks for the create-ticket form, mirroring TicketCreate in the API's
 * schemas.py (lengths, required fields, minimum location per scope). The API still
 * validates everything, including that the floor is in the building and the seat
 * is on the floor.
 */

/** Form fields in on-screen order, so the first invalid one can be focused. */
export const TICKET_FIELDS = [
  'title',
  'description',
  'category',
  'affected_scope',
  'building_id',
  'floor_id',
  'seat_id',
]

export const LIMITS = { title: 150, description: 5000 }

/** Which location levels a scope needs: "me" needs a seat, "floor" a floor. */
export function requiredLocation(scope) {
  return { floor: scope === 'floor' || scope === 'me', seat: scope === 'me' }
}

function text(value, limit, emptyMessage) {
  if (!value.trim()) return emptyMessage
  if (value.trim().length > limit) return `Use ${limit} characters or fewer.`
  return ''
}

const rules = {
  title: ({ title }) => text(title, LIMITS.title, 'Give the issue a short title.'),
  description: ({ description }) =>
    text(description, LIMITS.description, "Describe what's happening."),
  category: ({ category }) => (category ? '' : 'Choose a category.'),
  affected_scope: ({ affected_scope }) => (affected_scope ? '' : "Choose who's affected."),
  building_id: ({ building_id }) => (building_id ? '' : 'Choose a building.'),
  floor_id: ({ affected_scope, floor_id }) =>
    requiredLocation(affected_scope).floor && !floor_id ? 'Choose a floor.' : '',
  seat_id: ({ affected_scope, seat_id }) =>
    requiredLocation(affected_scope).seat && !seat_id ? 'Choose your seat.' : '',
}

/**
 * Error message for one field, or '' if it's valid.
 * @param {string} field one of TICKET_FIELDS
 * @param {Record<string, string>} values all form values (floor/seat depend on scope)
 */
export function validateTicketField(field, values) {
  return rules[field](values)
}

/**
 * All current errors, keyed by field. Empty object means the form can be submitted.
 * @param {Record<string, string>} values
 */
export function validateTicketForm(values) {
  const errors = {}
  for (const field of TICKET_FIELDS) {
    const message = validateTicketField(field, values)
    if (message) errors[field] = message
  }
  return errors
}

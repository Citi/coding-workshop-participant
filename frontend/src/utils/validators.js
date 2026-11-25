// Field validators for FormDialog `validate(value, values)` functions.
// Each returns an error message string, or undefined when the value is valid.

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0)
}

export const validEmail = (value) => (isBlank(value) || EMAIL_PATTERN.test(String(value).trim()) ? undefined : 'Enter a valid email address')

/** End date must not be before the start date held in another field. */
export const notBefore = (otherField, otherLabel) => (value, values) =>
  !isBlank(value) && !isBlank(values[otherField]) && value < values[otherField] ? `Must be on or after ${otherLabel}` : undefined

export const maxTwoDecimals = (value) =>
  isBlank(value) || /^\d+(\.\d{1,2})?$/.test(String(value)) ? undefined : 'Use at most 2 decimal places'

export const strongPassword = (value) => {
  if (isBlank(value)) return undefined
  if (value.length < 8) return 'Must be at least 8 characters'
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'Must contain at least one letter and one number'
  return undefined
}

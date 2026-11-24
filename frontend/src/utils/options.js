// Helpers for select / multiselect options ({ value, label }).

/**
 * Make sure a select's current value is one of its options (MUI warns about out-of-range values),
 * e.g. while options are still loading, or a fixed project that is missing from the loaded list.
 */
export function includeOption(options, value, label) {
  if (value === undefined || value === null || value === '' || options.some((option) => option.value === value)) return options
  return [{ value, label: label || `#${value}` }, ...options]
}

/**
 * includeOption for typed text such as a department from a link (?department=digital), which the
 * API matches case-insensitively: a value that matches an option apart from case selects that
 * option, shown with its own label and without a second entry; any other value is an option
 * labelled as it is written.
 *   includeTextOption([{ value: 'Digital', label: 'Digital' }], 'digital') -> [{ value: 'digital', label: 'Digital' }]
 *   includeTextOption([], 'Finance') -> [{ value: 'Finance', label: 'Finance' }]
 */
export function includeTextOption(options, value) {
  if (typeof value !== 'string' || value === '') return options
  const key = value.toLowerCase()
  const index = options.findIndex((option) => String(option.value).toLowerCase() === key)
  if (index === -1) return [{ value, label: value }, ...options]
  if (options[index].value === value) return options
  return options.map((option, position) => (position === index ? { ...option, value } : option))
}

/** Sort comparator for options by their visible label. */
export const byLabel = (a, b) => a.label.localeCompare(b.label)

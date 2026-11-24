// Helpers for select / multiselect options ({ value, label }).

/**
 * Make sure a select's current value is one of its options (MUI warns about out-of-range values),
 * e.g. while options are still loading, or a fixed project that is missing from the loaded list.
 */
export function includeOption(options, value, label) {
  if (value === undefined || value === null || value === '' || options.some((option) => option.value === value)) return options
  return [{ value, label: label || `#${value}` }, ...options]
}

/** Sort comparator for options by their visible label. */
export const byLabel = (a, b) => a.label.localeCompare(b.label)

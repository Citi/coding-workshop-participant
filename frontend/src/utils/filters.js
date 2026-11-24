// Helpers for the list filters (FilterBar values are sent to the API as query parameters).

/** True when any filter has a value (FilterBar keeps `search: undefined` after the box is cleared). */
export function hasActiveFilters(filters) {
  return Object.values(filters).some((value) => value !== undefined && value !== null && value !== '')
}

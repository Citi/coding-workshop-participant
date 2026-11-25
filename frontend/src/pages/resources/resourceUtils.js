// Pure helpers for the resources screens: route/URL parsing, utilization wording and select options.
import { textParam } from '../../hooks/useUrlFilters'
import { formatPercent } from '../../utils/format'
import { countLabel } from '../../utils/text'

/** A person is over-allocated above 100% (full time) across active projects (docs/API.md › Resources). */
export const FULL_TIME_PERCENT = 100

/** The API's limit for the department filter (a longer one is rejected with 400). */
const DEPARTMENT_MAX_LENGTH = 100

/** URL parameters of the Resources page filters (useUrlFilters keeps any other, e.g. view=heatmap). */
export const RESOURCE_URL_FILTERS = ['search', 'department', 'over_allocated']

/**
 * The Resources page filters in its URL, e.g. #/resources?over_allocated=true (the dashboard's
 * over-allocation card links here). Unknown or invalid values are ignored.
 */
export function resourceFiltersFromParams(params) {
  const filters = {}
  const search = textParam(params, 'search')
  if (search) filters.search = search
  const department = textParam(params, 'department', DEPARTMENT_MAX_LENGTH)
  if (department) filters.department = department
  if (params.get('over_allocated') === 'true') filters.over_allocated = true
  return filters
}

/** '2 team members are over-allocated (...)' - the list's call-out, scoped to the filtered list. */
export function overAllocatedNotice(count, filtered = false) {
  const who = `${countLabel(count, 'team member')}${filtered ? ' in this list' : ''}`
  return `${who} ${count === 1 ? 'is' : 'are'} over-allocated (more than ${FULL_TIME_PERCENT}% across active projects).`
}

/** Bar colour for a person's total allocation: red once they are over-allocated. */
export function allocationColor(overAllocated) {
  return overAllocated ? 'error' : 'primary'
}

/** '120% across 2 active projects' - the reason someone is (or is not) over-allocated. */
export function allocationSummary({ total_allocation_percent: total, active_project_count: count }) {
  return `${formatPercent(total ?? 0)} across ${countLabel(count ?? 0, 'active project')}`
}

/** The person's warning after an allocation change: 'Priya Shah is now over-allocated (120%)'. */
export function overAllocationWarning(allocation) {
  return `${allocation.resource_name} is now over-allocated (${formatPercent(allocation.resource_total_allocation_percent)})`
}


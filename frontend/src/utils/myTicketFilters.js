import { STATUSES } from './ticketFormat'

/**
 * The employee's "My tickets" status chips, in order. `active` is everything not closed
 * (the API's view=active); a status code shows just that status.
 */
export const SHOW_OPTIONS = ['active', 'open', 'in_progress', 'blocked', 'resolved', 'closed', 'all']

/**
 * A chip's label, e.g. "Active", "In Progress", "All".
 * @param {string} show
 * @returns {string}
 */
export function showLabel(show) {
  if (show === 'active') return 'Active'
  if (show === 'all') return 'All'
  return STATUSES[show].label
}

/**
 * How many tickets each chip would show, from the dashboard summary (all tickets).
 * @param {{activeCount: number, byStatus: Record<string, number>}} stats
 * @returns {Record<string, number>}
 */
export function showCounts({ activeCount, byStatus }) {
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0)
  return { active: activeCount, ...byStatus, all: total }
}

/**
 * The list request for the chosen chip and search, in GET /tickets query parameters.
 * Empty values are left out.
 * @param {{show: string, q: string}} filters
 * @returns {{view?: string, status?: string, q?: string}}
 */
export function myTicketsQuery({ show, q }) {
  const query = {}
  if (show === 'active' || show === 'closed') query.view = show
  else if (show !== 'all') query.status = show
  if (q) query.q = q
  return query
}

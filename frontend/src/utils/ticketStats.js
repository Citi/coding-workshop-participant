import { STATUSES, URGENCIES } from './ticketFormat'

/**
 * Dashboard numbers in one pass over the tickets: O(n) time, O(1) extra space.
 * "Active" matches the API's view=active: everything that isn't closed.
 *
 * @param {Array<{status: string, urgency: string, updated_at: string}>} tickets
 * @returns {{
 *   activeCount: number,
 *   byStatus: Record<string, number>,
 *   activeByUrgency: Record<string, number>,
 *   mostRecentActive: object | null,
 *   lastUpdatedAt: string | null,
 * }}
 */
export function summarizeTickets(tickets) {
  const byStatus = Object.fromEntries(Object.keys(STATUSES).map((s) => [s, 0]))
  const activeByUrgency = Object.fromEntries(Object.keys(URGENCIES).map((u) => [u, 0]))
  let activeCount = 0
  let mostRecentActive = null
  let lastUpdatedAt = null

  for (const ticket of tickets) {
    byStatus[ticket.status] += 1
    if (!lastUpdatedAt || Date.parse(ticket.updated_at) > Date.parse(lastUpdatedAt)) lastUpdatedAt = ticket.updated_at
    if (ticket.status === 'closed') continue
    activeCount += 1
    activeByUrgency[ticket.urgency] += 1
    if (!mostRecentActive || Date.parse(ticket.updated_at) > Date.parse(mostRecentActive.updated_at)) {
      mostRecentActive = ticket
    }
  }

  return { activeCount, byStatus, activeByUrgency, mostRecentActive, lastUpdatedAt }
}

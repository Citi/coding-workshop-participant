import { describe, expect, it } from 'vitest'

import { makeTicket, TICKETS } from '../test/fixtures'
import { summarizeTickets } from './ticketStats'

describe('summarizeTickets', () => {
  it('counts every status and the active tickets by urgency', () => {
    const stats = summarizeTickets(TICKETS)

    expect(stats.activeCount).toBe(3)
    expect(stats.byStatus).toEqual({ open: 1, in_progress: 1, blocked: 1, resolved: 0, closed: 1 })
    // The closed (medium) ticket is not counted as active.
    expect(stats.activeByUrgency).toEqual({ low: 0, medium: 2, high: 1 })
  })

  it('picks the most recently updated ticket that is not closed', () => {
    const newestIsClosed = [
      makeTicket({ ticket_id: 9, status: 'closed', updated_at: '2026-09-23T09:00:00Z' }),
      makeTicket({ ticket_id: 7, status: 'resolved', updated_at: '2026-09-22T09:00:00Z' }),
      makeTicket({ ticket_id: 8, status: 'open', updated_at: '2026-09-22T10:00:00Z' }),
    ]
    expect(summarizeTickets(newestIsClosed).mostRecentActive.ticket_id).toBe(8)
  })

  it('compares times, not text, across time-zone offsets', () => {
    const tickets = [
      makeTicket({ ticket_id: 1, updated_at: '2026-09-22T10:00:00-04:00' }), // 14:00 UTC
      makeTicket({ ticket_id: 2, updated_at: '2026-09-22T13:00:00+00:00' }), // 13:00 UTC
    ]
    expect(summarizeTickets(tickets).mostRecentActive.ticket_id).toBe(1)
  })

  it('handles no tickets and only-closed tickets', () => {
    expect(summarizeTickets([])).toEqual({
      activeCount: 0,
      byStatus: { open: 0, in_progress: 0, blocked: 0, resolved: 0, closed: 0 },
      activeByUrgency: { low: 0, medium: 0, high: 0 },
      mostRecentActive: null,
      lastUpdatedAt: null,
    })
    expect(summarizeTickets([makeTicket({ status: 'closed' })]).mostRecentActive).toBeNull()
  })

  it('finds the latest update across all tickets, closed ones included', () => {
    const tickets = [
      makeTicket({ ticket_id: 1, status: 'open', updated_at: '2026-09-22T10:00:00Z' }),
      makeTicket({ ticket_id: 2, status: 'closed', updated_at: '2026-09-22T13:00:00Z' }),
      makeTicket({ ticket_id: 3, status: 'open', updated_at: '2026-09-22T09:00:00-05:00' }), // 14:00 UTC
    ]
    expect(summarizeTickets(tickets).lastUpdatedAt).toBe('2026-09-22T09:00:00-05:00')
  })
})

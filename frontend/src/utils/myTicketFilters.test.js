import { describe, expect, it } from 'vitest'

import { myTicketsQuery, showCounts, showLabel, SHOW_OPTIONS } from './myTicketFilters'

describe('showLabel', () => {
  it('labels every chip', () => {
    expect(SHOW_OPTIONS.map(showLabel)).toEqual(['Active', 'Open', 'In Progress', 'Blocked', 'Resolved', 'Closed', 'All'])
  })
})

describe('showCounts', () => {
  it('counts active, each status and everything', () => {
    const byStatus = { open: 1, in_progress: 2, blocked: 0, resolved: 1, closed: 6 }
    expect(showCounts({ activeCount: 4, byStatus })).toEqual({ active: 4, ...byStatus, all: 10 })
  })
})

describe('myTicketsQuery', () => {
  it.each([
    [{ show: 'active', urgency: '', q: '' }, { view: 'active' }],
    [{ show: 'closed', urgency: '', q: '' }, { view: 'closed' }],
    [{ show: 'all', urgency: '', q: '' }, {}],
    [{ show: 'blocked', urgency: '', q: '' }, { status: 'blocked' }],
    [{ show: 'active', urgency: 'high', q: 'printer' }, { view: 'active', urgency: 'high', q: 'printer' }],
  ])('%j -> %j', (filters, expected) => {
    expect(myTicketsQuery(filters)).toEqual(expected)
  })
})

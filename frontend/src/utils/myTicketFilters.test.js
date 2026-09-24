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
    [{ show: 'active', q: '' }, { view: 'active' }],
    [{ show: 'closed', q: '' }, { view: 'closed' }],
    [{ show: 'all', q: '' }, {}],
    [{ show: 'blocked', q: '' }, { status: 'blocked' }],
    [{ show: 'active', q: 'printer' }, { view: 'active', q: 'printer' }],
  ])('%j -> %j', (filters, expected) => {
    expect(myTicketsQuery(filters)).toEqual(expected)
  })
})

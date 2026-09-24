import { describe, expect, it, vi } from 'vitest'

import { api } from './apiClient'
import {
  addNote,
  createTicket,
  getMyTicket,
  listMyTickets,
  listNotes,
  listStatusHistory,
  requestEscalation,
} from './ticketService'

describe('ticketService: details, notes and escalation', () => {
  it('reads a ticket, its status history and its notes', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({})
    const { signal } = new AbortController()

    await getMyTicket({ ticketId: '5' }, { signal })
    await listStatusHistory({ ticketId: '5' }, { signal })
    await listNotes({ ticketId: 5 })

    expect(get.mock.calls).toEqual([
      ['/tickets/5', { signal }],
      ['/tickets/5/history', { signal }],
      ['/tickets/5/notes', { signal: undefined }],
    ])
  })

  it('adds a trimmed note and a trimmed escalation reason', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({})

    await addNote(5, '  Still broken.  ')
    await requestEscalation('5', ' Whole floor is down. ')

    expect(post.mock.calls).toEqual([
      ['/tickets/5/notes', { note_text: 'Still broken.' }],
      ['/tickets/5/escalation', { reason: 'Whole floor is down.' }],
    ])
  })
})

const FORM = {
  title: '  Printer jam ',
  description: ' Every job jams. ',
  category: 'printer',
  affected_scope: 'me',
  building_id: '1',
  floor_id: '3',
  seat_id: '7',
}

describe('ticketService.createTicket', () => {
  it('trims text and sends ids as numbers', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ ticket_id: 9 })

    await createTicket(FORM)

    expect(post).toHaveBeenCalledWith('/tickets', {
      title: 'Printer jam',
      description: 'Every job jams.',
      category: 'printer',
      affected_scope: 'me',
      building_id: 1,
      floor_id: 3,
      seat_id: 7,
    })
  })

  it('leaves out a blank floor and seat', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ ticket_id: 9 })

    await createTicket({ ...FORM, affected_scope: 'building', floor_id: '', seat_id: '' })

    const body = post.mock.calls[0][1]
    expect(body).not.toHaveProperty('floor_id')
    expect(body).not.toHaveProperty('seat_id')
  })
})

describe('ticketService.listMyTickets', () => {
  it('passes filters as query params and the abort signal through', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    const { signal } = new AbortController()

    await listMyTickets({ view: 'active', q: 'wifi' }, { signal })

    expect(get).toHaveBeenCalledWith('/tickets', { params: { view: 'active', q: 'wifi' }, signal })
  })

  it('works with no arguments', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue([])
    await listMyTickets()
    expect(get).toHaveBeenCalledWith('/tickets', { params: {}, signal: undefined })
  })
})

import { describe, expect, it } from 'vitest'

import { describeLocation } from './useLocationOptions'

const locations = {
  buildings: { data: [{ building_id: 1, building_name: 'Building A' }] },
  floors: { data: [{ floor_id: 3, floor_number: 3 }] },
  seats: { data: [{ seat_id: 7, seat_number: '301' }] },
}

describe('describeLocation', () => {
  it('names every chosen level', () => {
    expect(describeLocation({ building_id: '1', floor_id: '3', seat_id: '7' }, locations)).toBe(
      'Building A · Floor 3 · Seat 301',
    )
  })

  it('leaves out levels not chosen', () => {
    expect(describeLocation({ building_id: '1', floor_id: '', seat_id: '' }, locations)).toBe('Building A')
  })

  it('is empty with nothing chosen or nothing loaded', () => {
    expect(describeLocation({ building_id: '', floor_id: '', seat_id: '' }, locations)).toBe('')
    const empty = { buildings: {}, floors: {}, seats: {} }
    expect(describeLocation({ building_id: '1', floor_id: '3', seat_id: '7' }, empty)).toBe('')
  })
})

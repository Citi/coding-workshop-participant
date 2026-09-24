import { describe, expect, it } from 'vitest'

import { requiredLocation, validateTicketField, validateTicketForm } from './ticketValidation'

const VALID = {
  title: 'Printer jam',
  description: 'Every job jams in tray 2.',
  category: 'printer',
  affected_scope: 'building',
  building_id: '1',
  floor_id: '',
  seat_id: '',
}

describe('ticket validation', () => {
  it('accepts a building-wide ticket with only a building', () => {
    expect(validateTicketForm(VALID)).toEqual({})
  })

  it('reports every missing field on an empty form', () => {
    const empty = Object.fromEntries(Object.keys(VALID).map((k) => [k, '']))
    expect(validateTicketForm(empty)).toEqual({
      title: 'Give the issue a short title.',
      description: "Describe what's happening.",
      category: 'Choose a category.',
      affected_scope: "Choose who's affected.",
      building_id: 'Choose a building.',
    })
  })

  it.each([
    ['building', {}, {}],
    ['floor', {}, { floor_id: 'Choose a floor.' }],
    ['floor', { floor_id: '3' }, {}],
    ['me', { floor_id: '3' }, { seat_id: 'Choose your seat.' }],
    ['me', {}, { floor_id: 'Choose a floor.', seat_id: 'Choose your seat.' }],
    ['me', { floor_id: '3', seat_id: '7' }, {}],
    ['building', { floor_id: '3', seat_id: '7' }, {}],
  ])('scope %s with %o -> %o', (scope, location, expected) => {
    expect(validateTicketForm({ ...VALID, affected_scope: scope, ...location })).toEqual(expected)
  })

  it.each([
    ['title', 150],
    ['description', 5000],
  ])('limits %s to %i characters and ignores surrounding spaces', (field, limit) => {
    expect(validateTicketField(field, { ...VALID, [field]: `  ${'x'.repeat(limit)}  ` })).toBe('')
    expect(validateTicketField(field, { ...VALID, [field]: 'x'.repeat(limit + 1) })).toBe(
      `Use ${limit} characters or fewer.`,
    )
  })

  it('rejects whitespace-only text', () => {
    expect(validateTicketField('title', { ...VALID, title: '   ' })).toBe('Give the issue a short title.')
  })

  it('knows which levels each scope needs', () => {
    expect(requiredLocation('me')).toEqual({ floor: true, seat: true })
    expect(requiredLocation('floor')).toEqual({ floor: true, seat: false })
    expect(requiredLocation('building')).toEqual({ floor: false, seat: false })
    expect(requiredLocation('')).toEqual({ floor: false, seat: false })
  })
})

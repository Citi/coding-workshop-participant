import { describe, expect, it } from 'vitest'

import { firstNameOf, greetingFor, initialsFor } from './people'

describe('initialsFor', () => {
  it.each([
    ['Priya Shah', 'PS'],
    ['Cher', 'C'],
    ['  maria  de la  cruz ', 'MC'],
    ['Élodie Brun', 'ÉB'],
    ['', '?'],
    ['   ', '?'],
    [null, '?'],
    [undefined, '?'],
  ])('%j -> %s', (name, expected) => {
    expect(initialsFor(name)).toBe(expected)
  })
})

describe('firstNameOf', () => {
  it.each([
    ['Priya Shah', 'Priya'],
    ['  Cher ', 'Cher'],
    ['', ''],
    [null, ''],
  ])('%j -> %j', (name, expected) => {
    expect(firstNameOf(name)).toBe(expected)
  })
})

describe('greetingFor', () => {
  it.each([
    [4, 'Good evening'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('at %i:30 says %s', (hour, expected) => {
    expect(greetingFor(new Date(2026, 8, 23, hour, 30))).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'

import { initialsFor } from './people'

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

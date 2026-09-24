import { describe, expect, it } from 'vitest'

import { passwordStrength } from './passwordStrength'

describe('passwordStrength', () => {
  it('says nothing about an empty password', () => {
    expect(passwordStrength('')).toBeNull()
  })

  it.each([
    ['a', 1, 'Too short'],
    ['Abc1!xy', 1, 'Too short'],
    ['password', 2, 'Fair'],
    ['password1', 2, 'Fair'],
    ['Password1', 3, 'Good'],
    ['longpassword', 3, 'Good'],
    ['Long-password1', 4, 'Strong'],
    ['correct horse battery staple', 3, 'Good'],
  ])('%j scores %i (%s)', (password, score, label) => {
    expect(passwordStrength(password)).toEqual({ score, label })
  })
})

import { describe, expect, it } from 'vitest'
import { JANE } from './userFixtures'
import {
  deleteUserMessage,
  passwordRule,
  ROLE_HELP,
  SELF_ROLE_REASON,
  SELF_STATUS_REASON,
  toUserPayload,
  USER_FILTERS,
  userFields,
} from './userFields'

const byName = (fields) => Object.fromEntries(fields.map((field) => [field.name, field]))

describe('passwordRule', () => {
  it('accepts blank (the field decides if it is required) and strong passwords', () => {
    expect(passwordRule('')).toBeUndefined()
    expect(passwordRule('Secret123')).toBeUndefined()
    expect(passwordRule('a1'.repeat(36))).toBeUndefined()
  })

  it('mirrors the API rules: length, a letter and a number, at most 72 bytes', () => {
    expect(passwordRule('Ab1')).toBe('Must be at least 8 characters')
    expect(passwordRule('abcdefgh')).toBe('Must contain at least one letter and one number')
    expect(passwordRule('12345678')).toBe('Must contain at least one letter and one number')
    expect(passwordRule('a1'.repeat(36) + 'x')).toMatch(/^Must be at most 72 bytes/)
    // 40 characters, but 'é' takes 2 bytes in UTF-8: 1 + 72 + 3 = 76 bytes.
    expect(passwordRule('a' + 'é'.repeat(36) + '123')).toMatch(/^Must be at most 72 bytes/)
  })
})

describe('userFields', () => {
  it('requires a password for new users', () => {
    const fields = byName(userFields())
    expect(Object.keys(fields)).toEqual(['full_name', 'email', 'role', 'password', 'is_active'])
    expect(fields.full_name).toMatchObject({ required: true, maxLength: 120 })
    // The API's email rule: valid, at most 255 characters (as on the resource form).
    expect(fields.email).toMatchObject({ type: 'email', required: true, maxLength: 255 })
    expect(fields.role).toMatchObject({ type: 'select', required: true, disabled: false, helperText: ROLE_HELP })
    expect(fields.role.options.map((option) => option.value)).toEqual(['admin', 'manager', 'contributor', 'viewer'])
    expect(fields.password).toMatchObject({ label: 'Password', type: 'password', required: true, validate: passwordRule })
    expect(fields.is_active).toMatchObject({ type: 'checkbox', disabled: false })
  })

  it('makes the password optional when editing', () => {
    const { password } = byName(userFields({ editing: true }))
    expect(password).toMatchObject({ label: 'New password', required: false, helperText: 'Leave blank to keep the current password' })
  })

  it("locks the admin's own role and status, saying why", () => {
    const fields = byName(userFields({ editing: true, isSelf: true }))
    expect(fields.role).toMatchObject({ disabled: true, helperText: SELF_ROLE_REASON })
    expect(fields.is_active).toMatchObject({ disabled: true, helperText: SELF_STATUS_REASON })
    expect(fields.full_name.disabled).toBeUndefined()
  })

  it('filters by role and by active/disabled status', () => {
    expect(USER_FILTERS.map((filter) => filter.name)).toEqual(['role', 'is_active'])
    expect(USER_FILTERS[1].options).toEqual([
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Disabled' },
    ])
  })
})

describe('toUserPayload', () => {
  const values = { full_name: 'Jane Doe', email: 'jane@acme.com', role: 'manager', is_active: true, password: '' }

  it('always sends the password of a new user', () => {
    expect(toUserPayload({ ...values, password: 'Secret123' })).toEqual({ ...values, password: 'Secret123' })
  })

  it('leaves a blank password out of an update', () => {
    expect(toUserPayload(values, { editing: true })).toEqual({ full_name: 'Jane Doe', email: 'jane@acme.com', role: 'manager', is_active: true })
    expect(toUserPayload({ ...values, password: '   ' }, { editing: true })).not.toHaveProperty('password')
    expect(toUserPayload({ ...values, password: 'Changed123' }, { editing: true })).toHaveProperty('password', 'Changed123')
  })

  it('sends is_active as a boolean', () => {
    expect(toUserPayload({ ...values, is_active: undefined, password: 'Secret123' }).is_active).toBe(false)
  })
})

describe('deleteUserMessage', () => {
  it('says what is deleted and what is not', () => {
    expect(deleteUserMessage(JANE)).toBe(
      'Jane Doe (jane@acme.com) will be permanently deleted and will no longer be able to sign in. ' +
        'Projects and other records are not affected. To block access but keep the account, disable it instead.',
    )
  })
})

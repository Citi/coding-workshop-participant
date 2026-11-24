// User create/edit form (FormDialog config), filters and request helpers, mirroring docs/API.md › Users.
import { optionsFor } from '../../utils/labels'
import { isBlank, strongPassword } from '../../utils/validators'

export const FULL_NAME_MAX_LENGTH = 120
export const EMAIL_MAX_LENGTH = 255
export const PASSWORD_MAX_BYTES = 72

export const ROLE_HELP = 'Viewer: read only · Contributor: create and edit · Manager: also delete · Admin: also manage users'
// The API refuses these with 400 INVALID_OPERATION; the UI disables the controls and says why.
export const SELF_DELETE_REASON = 'You cannot delete your own account'
export const SELF_ROLE_REASON = 'You cannot change your own role'
export const SELF_STATUS_REASON = 'You cannot disable your own account'

/** The API's password rule: at least 8 characters with a letter and a number, at most 72 bytes (UTF-8). */
export function passwordRule(value) {
  if (isBlank(value)) return undefined
  const error = strongPassword(value)
  if (error) return error
  return new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES
    ? `Must be at most ${PASSWORD_MAX_BYTES} bytes (accented letters and emoji count as 2-4)`
    : undefined
}

/** FilterBar selects (the status values are sent as is_active=true|false). */
export const USER_FILTERS = [
  { name: 'role', label: 'Role', options: optionsFor('role') },
  {
    name: 'is_active',
    label: 'Status',
    options: [
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Disabled' },
    ],
  },
]

/**
 * Fields for creating a user, or editing one (`editing`: the password becomes optional).
 * isSelf: the logged-in admin's own account, whose role and status are locked.
 */
export function userFields({ editing = false, isSelf = false } = {}) {
  return [
    { name: 'full_name', label: 'Full name', required: true, maxLength: FULL_NAME_MAX_LENGTH, autoFocus: true },
    { name: 'email', label: 'Email', type: 'email', required: true, maxLength: EMAIL_MAX_LENGTH },
    {
      name: 'role',
      label: 'Role',
      type: 'select',
      required: true,
      options: optionsFor('role'),
      disabled: isSelf,
      helperText: isSelf ? SELF_ROLE_REASON : ROLE_HELP,
    },
    {
      name: 'password',
      label: editing ? 'New password' : 'Password',
      type: 'password',
      required: !editing,
      validate: passwordRule,
      helperText: editing ? 'Leave blank to keep the current password' : 'At least 8 characters, including a letter and a number',
    },
    {
      name: 'is_active',
      label: 'Active (can sign in)',
      type: 'checkbox',
      disabled: isSelf,
      helperText: isSelf ? SELF_STATUS_REASON : 'Disabled accounts cannot sign in',
    },
  ]
}

/** New accounts start active with the least privileged role. */
export const NEW_USER_VALUES = { role: 'viewer', is_active: true }

/** FormDialog values -> POST/PUT body. When editing, a blank password is left out (the current one is kept). */
export function toUserPayload(values, { editing = false } = {}) {
  const payload = {
    email: values.email,
    full_name: values.full_name,
    role: values.role,
    is_active: Boolean(values.is_active),
  }
  if (!editing || !isBlank(values.password)) payload.password = values.password
  return payload
}

/** Delete confirmation text: only the account goes; project data is untouched. */
export function deleteUserMessage(user) {
  return (
    `${user.full_name} (${user.email}) will be permanently deleted and will no longer be able to sign in. ` +
    'Projects and other records are not affected. To block access but keep the account, disable it instead.'
  )
}

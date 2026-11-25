import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { usersApi } from '../../services/usersApi'
import { makeAuth, renderWithProviders } from '../../test/renderWithProviders'
import { JANE, listOf, OMAR, SELF } from './userFixtures'
import UsersPage from './UsersPage'

vi.mock('../../services/usersApi', () => ({
  usersApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

// These are long user flows: on a busy machine allow slow renders instead of failing.
configure({ asyncUtilTimeout: 5000 })
const SLOW_MACHINE = { timeout: 30000 }

function renderPage(options = {}) {
  renderWithProviders(<UsersPage />, { route: '/users', path: '/users', ...options })
  return { user: userEvent.setup({ delay: null }) }
}

const findTable = () => screen.findByRole('table', { name: 'Users' })
const rowOf = (name) => screen.getByText(name).closest('tr')

/** Pick an option in an MUI select and wait for its menu to close. */
async function choose(user, label, option, container = document.body) {
  await user.click(within(container).getByRole('combobox', { name: label }))
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', { name: option }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

async function openDialog(user, buttonName, dialogName) {
  await findTable()
  await user.click(screen.getByRole('button', { name: buttonName }))
  return screen.getByRole('dialog', { name: dialogName })
}

async function retype(user, input, text) {
  await user.clear(input)
  await user.type(input, text)
}

beforeEach(() => {
  vi.resetAllMocks()
  mobile.value = false
  usersApi.list.mockResolvedValue(listOf(JANE, OMAR, SELF))
})

describe('UsersPage', SLOW_MACHINE, () => {
  it('shows a loading state, then each account with its role and status', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    await findTable()
    expect(usersApi.list).toHaveBeenCalledWith({})
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name', 'Email', 'Role', 'Status', 'Created', 'Actions',
    ])

    const jane = rowOf('Jane Doe')
    expect(within(jane).getByText('jane@acme.com')).toBeInTheDocument()
    expect(within(jane).getByText('Manager')).toBeInTheDocument()
    expect(within(jane).getByText('Active')).toBeInTheDocument()
    expect(within(jane).getByText('Nov 24, 2026')).toBeInTheDocument()
    expect(within(jane).queryByText('You')).not.toBeInTheDocument()

    const omar = rowOf('Omar Haddad')
    expect(within(omar).getByText('Viewer')).toBeInTheDocument()
    expect(within(omar).getByText('Disabled')).toBeInTheDocument()

    const self = rowOf('System Administrator')
    expect(within(self).getByText('You')).toBeInTheDocument()
    expect(within(self).getByText('Admin')).toBeInTheDocument()
    expect(within(self).getByText('Jan 5, 2026')).toBeInTheDocument()
  })

  it('sorts accounts by name, role, status and creation date from the column headers', async () => {
    const { user } = renderPage()
    await findTable()
    const NAMES = ['Jane Doe', 'Omar Haddad', 'System Administrator']
    const order = () => screen.getAllByRole('row').slice(1).map((row) => NAMES.find((name) => row.textContent.includes(name)))
    const sortBy = (header) => user.click(screen.getByRole('button', { name: header }))

    await sortBy('Role')
    expect(order()).toEqual(['System Administrator', 'Jane Doe', 'Omar Haddad'])
    await sortBy('Status')
    await sortBy('Status')
    expect(order()).toEqual(['Omar Haddad', 'Jane Doe', 'System Administrator'])
    await sortBy('Created')
    expect(order()).toEqual(['System Administrator', 'Omar Haddad', 'Jane Doe'])
    await sortBy('Name')
    await sortBy('Name')
    expect(order()).toEqual(['System Administrator', 'Omar Haddad', 'Jane Doe'])
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending')
    expect(within(screen.getByRole('columnheader', { name: 'Actions' })).queryByRole('button')).not.toBeInTheDocument()
  })

  it('sends the search text, role and status filters to the API as query parameters', async () => {
    const { user } = renderPage()
    await findTable()
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'jane')
    await waitFor(() => expect(usersApi.list).toHaveBeenLastCalledWith({ search: 'jane' }))
    await choose(user, 'Role', 'Manager')
    await waitFor(() => expect(usersApi.list).toHaveBeenLastCalledWith({ search: 'jane', role: 'manager' }))
    await choose(user, 'Status', 'Disabled')
    await waitFor(() => expect(usersApi.list).toHaveBeenLastCalledWith({ search: 'jane', role: 'manager', is_active: 'false' }))
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(usersApi.list).toHaveBeenLastCalledWith({}))
  })

  it('creates a user after validating the form', async () => {
    usersApi.create.mockResolvedValue({ ...JANE, id: 9, full_name: 'Li Wei' })
    const { user } = renderPage()
    const dialog = await openDialog(user, 'New user', 'New user')
    expect(within(dialog).getByRole('combobox', { name: /Role/ })).toHaveTextContent('Viewer')
    expect(within(dialog).getByRole('checkbox', { name: /Active/ })).toBeChecked()
    expect(within(dialog).getByLabelText(/Password/)).toHaveAttribute('type', 'password')

    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    expect(within(dialog).getByText('Please fix the highlighted fields.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('This field is required')).toHaveLength(3)

    await user.type(within(dialog).getByLabelText(/Full name/), 'Li Wei')
    await user.type(within(dialog).getByLabelText(/Email/), 'li.wei@acme')
    await user.type(within(dialog).getByLabelText(/Password/), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument()
    expect(within(dialog).getByText('Must contain at least one letter and one number')).toBeInTheDocument()
    expect(usersApi.create).not.toHaveBeenCalled()

    await retype(user, within(dialog).getByLabelText(/Email/), 'li.wei@acme.com')
    await retype(user, within(dialog).getByLabelText(/Password/), 'Welcome2026')
    await choose(user, /Role/, 'Contributor', dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await waitFor(() =>
      expect(usersApi.create).toHaveBeenCalledWith({
        email: 'li.wei@acme.com', full_name: 'Li Wei', role: 'contributor', password: 'Welcome2026', is_active: true,
      }),
    )
    expect(await screen.findByText('User created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(2))
  })

  it('shows a duplicate email error next to the email field', async () => {
    const message = 'A user with this email already exists'
    usersApi.create.mockRejectedValue(new ApiError({ status: 409, code: 'CONFLICT', message, details: { email: message } }))
    const { user } = renderPage()
    const dialog = await openDialog(user, 'New user', 'New user')
    await user.type(within(dialog).getByLabelText(/Full name/), 'Jane Again')
    await user.type(within(dialog).getByLabelText(/Email/), 'JANE@acme.com')
    await user.type(within(dialog).getByLabelText(/Password/), 'Welcome2026')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    const email = within(dialog).getByLabelText(/Email/)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription(message)
    expect(within(dialog).getByRole('button', { name: 'Create user' })).toBeEnabled()
    expect(usersApi.list).toHaveBeenCalledTimes(1)
  })

  it('edits a user and keeps the current password when the field is left blank', async () => {
    usersApi.update.mockResolvedValue({ ...JANE, role: 'contributor', is_active: false })
    const { user } = renderPage()
    const dialog = await openDialog(user, 'Edit Jane Doe', 'Edit user')
    expect(within(dialog).getByLabelText(/Full name/)).toHaveValue('Jane Doe')
    expect(within(dialog).getByLabelText(/Email/)).toHaveValue('jane@acme.com')
    expect(within(dialog).getByRole('combobox', { name: /Role/ })).toHaveTextContent('Manager')
    const password = within(dialog).getByLabelText(/New password/)
    expect(password).toHaveValue('')
    expect(password).not.toBeRequired()
    expect(password).toHaveAccessibleDescription('Leave blank to keep the current password')

    await choose(user, /Role/, 'Contributor', dialog)
    await user.click(within(dialog).getByRole('checkbox', { name: /Active/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(usersApi.update).toHaveBeenCalledWith(5, { email: 'jane@acme.com', full_name: 'Jane Doe', role: 'contributor', is_active: false }),
    )
    expect(await screen.findByText('User updated')).toBeInTheDocument()
    await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(2))
  })

  it('sends a new password only when one is typed, after checking it', async () => {
    usersApi.update.mockResolvedValue(OMAR)
    const { user } = renderPage()
    const dialog = await openDialog(user, 'Edit Omar Haddad', 'Edit user')
    expect(within(dialog).getByRole('checkbox', { name: /Active/ })).not.toBeChecked()
    await user.type(within(dialog).getByLabelText(/New password/), 'short1')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(within(dialog).getByText('Must be at least 8 characters')).toBeInTheDocument()
    expect(usersApi.update).not.toHaveBeenCalled()

    await retype(user, within(dialog).getByLabelText(/New password/), 'Changed2026')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(usersApi.update).toHaveBeenCalledWith(7, {
        email: OMAR.email, full_name: 'Omar Haddad', role: 'viewer', is_active: false, password: 'Changed2026',
      }),
    )
  })

  it('stops the logged-in admin from deleting themselves, with a tooltip saying why', async () => {
    const { user } = renderPage()
    await findTable()
    const deleteSelf = screen.getByRole('button', { name: 'Delete System Administrator' })
    expect(deleteSelf).toBeDisabled()
    await user.hover(deleteSelf.parentElement)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('You cannot delete your own account')
    expect(screen.getByRole('button', { name: 'Delete Jane Doe' })).toBeEnabled()
  })

  it("locks the admin's own role and status in the edit form, saying why", async () => {
    usersApi.update.mockResolvedValue({ ...SELF, full_name: 'Sys Admin' })
    const { user } = renderPage()
    const dialog = await openDialog(user, 'Edit System Administrator', 'Edit user')
    expect(dialog).toHaveTextContent('This is your own account')
    expect(within(dialog).getByRole('combobox', { name: /Role/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(dialog).getByText('You cannot change your own role')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Active/ })).toBeDisabled()
    expect(within(dialog).getByText('You cannot disable your own account')).toBeInTheDocument()

    await retype(user, within(dialog).getByLabelText(/Full name/), 'Sys Admin')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(usersApi.update).toHaveBeenCalledWith(1, { email: 'admin@acme.com', full_name: 'Sys Admin', role: 'admin', is_active: true }),
    )
  })

  it('shows the API message when a business rule refuses the change', async () => {
    const message = 'You cannot change your own role'
    usersApi.update.mockRejectedValue(new ApiError({ status: 400, code: 'INVALID_OPERATION', message }))
    const { user } = renderPage()
    const dialog = await openDialog(user, 'Edit System Administrator', 'Edit user')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('deletes a user after a confirmation that explains what is removed', async () => {
    usersApi.remove.mockResolvedValue(null)
    const { user } = renderPage()
    const dialog = await openDialog(user, 'Delete Jane Doe', 'Delete user?')
    expect(dialog).toHaveTextContent('Jane Doe (jane@acme.com) will be permanently deleted')
    expect(dialog).toHaveTextContent('disable it instead')

    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }))
    await waitFor(() => expect(usersApi.remove).toHaveBeenCalledWith(5))
    expect(await screen.findByText('User deleted')).toBeInTheDocument()
    await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(2))
  })

  it('keeps the confirmation open with the API message when a delete is refused', async () => {
    const message = 'This user cannot be deleted'
    usersApi.remove.mockRejectedValue(new ApiError({ status: 400, code: 'INVALID_OPERATION', message }))
    const { user } = renderPage()
    const dialog = await openDialog(user, 'Delete Omar Haddad', 'Delete user?')
    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(usersApi.list).toHaveBeenCalledTimes(1)
  })

  it('shows no create, edit or delete controls without the matching permissions', async () => {
    renderPage({ auth: makeAuth({ permissions: ['users:read'] }) })
    await findTable()
    expect(screen.queryByRole('button', { name: 'New user' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('shows only the actions the role allows', async () => {
    renderPage({ auth: makeAuth({ permissions: ['users:read', 'users:update'] }) })
    await findTable()
    expect(screen.getByRole('button', { name: 'Edit Jane Doe' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New user' })).not.toBeInTheDocument()
  })

  it('shows the error with a Retry button when loading fails', async () => {
    usersApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The database is unavailable' }))
    const { user } = renderPage()
    expect(await screen.findByText(/The database is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the users. The database is unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findTable()).toBeInTheDocument()
    expect(usersApi.list).toHaveBeenCalledTimes(2)
  })

  it('explains an empty list, with or without filters', async () => {
    usersApi.list.mockResolvedValue(listOf())
    const { user } = renderPage()
    expect(await screen.findByText('No users yet')).toBeInTheDocument()
    expect(screen.getByText('Create an account for each person who needs to sign in.')).toBeInTheDocument()
    await choose(user, 'Role', 'Viewer')
    expect(await screen.findByText('No matching users')).toBeInTheDocument()
    expect(screen.getByText(/Try changing or clearing them/)).toBeInTheDocument()
  })

  it('tells read-only users that accounts appear once created', async () => {
    usersApi.list.mockResolvedValue(listOf())
    renderPage({ auth: makeAuth({ permissions: ['users:read'] }) })
    expect(await screen.findByText('User accounts will appear here once they are created.')).toBeInTheDocument()
  })

  it('shows accounts as cards on mobile, without the created date', async () => {
    mobile.value = true
    renderPage()
    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(3)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(cards[1]).getByText(OMAR.email)).toBeInTheDocument()
    expect(within(cards[1]).queryByText('Created')).not.toBeInTheDocument()
    expect(within(cards[2]).getByRole('button', { name: 'Delete System Administrator' })).toBeDisabled()
  })
})

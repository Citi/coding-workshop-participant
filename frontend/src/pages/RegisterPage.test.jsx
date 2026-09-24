import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { register } from '../services/authService'
import { renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/authService', () => ({ register: vi.fn() }))

// MUI appends " *" to required labels, so match on how the label starts
// ("Password" must not also match "Confirm password").
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const field = (label) => screen.getByLabelText(new RegExp(`^${escapeRegExp(label)}`))
const submitButton = () => screen.getByRole('button', { name: /create account|creating account/i })

async function fillValidForm(user, overrides = {}) {
  const values = {
    'Full name': 'Jane Doe',
    'Work email': 'jane@acme.inc',
    'Password': 'password123',
    'Confirm password': 'password123',
    ...overrides,
  }
  for (const [label, value] of Object.entries(values)) {
    if (value) await user.type(field(label), value)
  }
}

function renderPage() {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/register' })
  return user
}

beforeEach(() => {
  vi.mocked(register).mockReset()
})

describe('RegisterPage', () => {
  it('shows labelled fields with required markers', () => {
    renderPage()
    for (const label of ['Full name', 'Work email', 'Password', 'Confirm password']) {
      expect(field(label)).toBeRequired()
    }
    expect(field('Phone (optional)')).not.toBeRequired()
    const account = screen.getByRole('navigation', { name: 'Account' })
    expect(within(account).getByRole('link', { current: 'page' })).toHaveTextContent('Create account')
    expect(within(account).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByText('New accounts start as Employee. A Facility Admin can give you Engineer access.')).toBeInTheDocument()
  })

  it('blocks an empty submit, explains each field and focuses the first', async () => {
    const user = renderPage()

    await user.click(submitButton())

    expect(register).not.toHaveBeenCalled()
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your work email.')).toBeInTheDocument()
    expect(screen.getByText('Enter a password.')).toBeInTheDocument()
    expect(field('Full name')).toHaveFocus()
    expect(field('Full name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('checks a field when the user leaves it, and clears the error as they fix it', async () => {
    const user = renderPage()

    await user.type(field('Work email'), 'jane@gmail.com')
    await user.tab()
    expect(screen.getByText('Use your @acme.inc email address.')).toBeInTheDocument()

    await user.clear(field('Work email'))
    await user.type(field('Work email'), 'jane@acme.inc')
    expect(screen.queryByText('Use your @acme.inc email address.')).not.toBeInTheDocument()
  })

  it('does not flag a field the user only tabbed through', async () => {
    const user = renderPage()
    await user.click(field('Full name'))
    await user.tab()
    expect(screen.queryByText('Enter your full name.')).not.toBeInTheDocument()
  })

  it('catches mismatched passwords before sending', async () => {
    const user = renderPage()
    await fillValidForm(user, { 'Confirm password': 'password124' })

    await user.click(submitButton())

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('disables the form while creating the account', async () => {
    let finish
    vi.mocked(register).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = renderPage()
    await fillValidForm(user)

    await user.click(submitButton())

    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent('Creating account…')
    expect(field('Work email')).toBeDisabled()
    finish({ email: 'jane@acme.inc' })
    await screen.findByText(/Account created for jane@acme.inc/)
  })

  it('sends the form and goes to sign in with a success message', async () => {
    vi.mocked(register).mockResolvedValue({ user_id: 1, email: 'jane@acme.inc' })
    const user = renderPage()
    await fillValidForm(user, { 'Work email': 'Jane@ACME.inc', 'Phone (optional)': '555-0101' })

    await user.click(submitButton())

    expect(register).toHaveBeenCalledWith({
      full_name: 'Jane Doe',
      email: 'Jane@ACME.inc',
      phone_number: '555-0101',
      password: 'password123',
      confirm_password: 'password123',
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Account created for jane@acme.inc. Please sign in.',
    )
  })

  it('shows a taken email under the email field', async () => {
    vi.mocked(register).mockRejectedValue(
      new ApiError('An account with this email already exists', { status: 409 }),
    )
    const user = renderPage()
    await fillValidForm(user)

    await user.click(submitButton())

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(field('Work email')).toHaveAttribute('aria-invalid', 'true')
    expect(submitButton()).toBeEnabled()
  })

  it('puts API validation messages next to their fields', async () => {
    vi.mocked(register).mockRejectedValue(
      new ApiError('Please fix the highlighted fields.', {
        status: 422,
        fieldErrors: { password: 'String should have at least 8 characters' },
      }),
    )
    const user = renderPage()
    await fillValidForm(user)

    await user.click(submitButton())

    expect(await screen.findByText('String should have at least 8 characters')).toBeInTheDocument()
    expect(field('Password')).toHaveAttribute('aria-invalid', 'true')
  })

  it.each([
    ['network failure', new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 })],
    ['server error', new ApiError('Something went wrong on our side. Please try again.', { status: 500 })],
    ['422 about a field not on the form', new ApiError('Please fix the highlighted fields.', { status: 422, fieldErrors: { role: 'bad' } })],
  ])('shows a page-level alert for a %s', async (_label, error) => {
    vi.mocked(register).mockRejectedValue(error)
    const user = renderPage()
    await fillValidForm(user)

    await user.click(submitButton())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(error.message))
    expect(submitButton()).toBeEnabled()
  })

  it('never shows raw JavaScript errors', async () => {
    vi.mocked(register).mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'email')"))
    const user = renderPage()
    await fillValidForm(user)

    await user.click(submitButton())

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.'),
    )
    expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument()
  })

  it('explains the password rule, then rates the password as it is typed', async () => {
    const user = renderPage()
    const filledBars = () => screen.queryAllByTestId('strength-bar').filter((bar) => bar.dataset.filled === 'true')
    expect(field('Password')).toHaveAccessibleDescription('At least 8 characters.')
    expect(screen.queryAllByTestId('strength-bar')).toHaveLength(0)

    await user.type(field('Password'), 'abc')
    expect(field('Password')).toHaveAccessibleDescription('Too short · at least 8 characters')
    expect(filledBars()).toHaveLength(1)

    await user.type(field('Password'), 'defgh')
    expect(field('Password')).toHaveAccessibleDescription('Fair · at least 8 characters')

    await user.clear(field('Password'))
    await user.type(field('Password'), 'Long-password1')
    expect(field('Password')).toHaveAccessibleDescription('Strong · at least 8 characters')
    expect(filledBars()).toHaveLength(4)
  })

  it('shows an error instead of the meter', async () => {
    const user = renderPage()
    await user.type(field('Password'), 'short')
    await user.tab()
    expect(field('Password')).toHaveAccessibleDescription('Use at least 8 characters.')
    expect(screen.queryAllByTestId('strength-bar')).toHaveLength(0)
  })

  it('shows each password on its own', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Show confirm password' }))
    expect(field('Confirm password')).toHaveAttribute('type', 'text')
    expect(field('Password')).toHaveAttribute('type', 'password')
  })
})

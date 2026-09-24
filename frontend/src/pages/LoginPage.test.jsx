import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { login } from '../services/authService'
import { getSession } from '../services/session'
import { ALEX, JANE, renderWithProviders, SAM, TEST_TOKEN } from '../test/renderWithProviders'

const SESSION = { token: TEST_TOKEN, user: JANE }

vi.mock('../services/authService', () => ({ login: vi.fn(), register: vi.fn() }))

// The dashboards load tickets on arrival; these tests only care about routing and sign-in.
vi.mock('../services/ticketService', () => ({ listMyTickets: vi.fn().mockResolvedValue([]) }))
vi.mock('../services/adminTicketService', () => ({
  listAllTickets: vi.fn().mockResolvedValue([]),
  getMetrics: vi.fn().mockResolvedValue({ unassigned: 0, open: 0, in_progress: 0, blocked: 0, resolved: 0, active_p1: 0, escalated: 0, closed_last_7_days: 0 }),
}))
vi.mock('../services/locationService', () => ({ listBuildings: vi.fn().mockResolvedValue([]) }))
vi.mock('../services/adminUserService', () => ({ listEngineers: vi.fn().mockResolvedValue([]) }))
vi.mock('../services/engineerTicketService', () => ({ listMyQueue: vi.fn().mockResolvedValue([]) }))

const emailField = () => screen.getByLabelText(/^Work email/)
const passwordField = () => screen.getByLabelText(/^Password/)
const submitButton = () => screen.getByRole('button', { name: /sign in|signing in/i })

function renderPage(route = '/login') {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route })
  return user
}

async function signInAs(user, email = 'jane@acme.inc', password = 'password123') {
  await user.type(emailField(), email)
  await user.type(passwordField(), password)
  await user.click(submitButton())
}

beforeEach(() => {
  vi.mocked(login).mockReset()
})

describe('LoginPage', () => {
  it('shows required email and password fields and a link to sign up', () => {
    renderPage()
    expect(emailField()).toBeRequired()
    expect(passwordField()).toBeRequired()
    const account = screen.getByRole('navigation', { name: 'Account' })
    expect(within(account).getByRole('link', { current: 'page' })).toHaveTextContent('Sign in')
    expect(within(account).getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('pre-fills the email after registering and starts on the password', () => {
    renderPage({ pathname: '/login', state: { registeredEmail: 'new@acme.inc' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Account created for new@acme.inc. Please sign in.')
    expect(emailField()).toHaveValue('new@acme.inc')
    expect(passwordField()).toHaveFocus()
  })

  it('asks for both fields before sending', async () => {
    const user = renderPage()

    await user.click(submitButton())

    expect(login).not.toHaveBeenCalled()
    expect(screen.getByText('Enter your work email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(emailField()).toHaveFocus()
  })

  it('focuses the password when only it is missing, and clears the error on typing', async () => {
    const user = renderPage()
    await user.type(emailField(), 'jane@acme.inc')

    await user.click(submitButton())
    expect(passwordField()).toHaveFocus()

    await user.type(passwordField(), 'x')
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument()
  })

  it('signs in, remembers the user and opens the dashboard', async () => {
    vi.mocked(login).mockResolvedValue(SESSION)
    const user = renderPage()

    await signInAs(user)

    expect(login).toHaveBeenCalledWith({ email: 'jane@acme.inc', password: 'password123' })
    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(getSession()).toEqual(SESSION)
  })

  it('returns to the page that asked for sign-in', async () => {
    vi.mocked(login).mockResolvedValue(SESSION)
    const user = renderPage('/dashboard')
    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in to continue.')

    await signInAs(user)

    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
  })

  it.each([
    ['an engineer', SAM, 'My queue'],
    ['an admin', ALEX, 'Facility Admin dashboard'],
  ])('sends %s to their own start page', async (_who, staff, name) => {
    vi.mocked(login).mockResolvedValue({ token: TEST_TOKEN, user: staff })
    const user = renderPage()

    await signInAs(user, staff.email)

    expect(await screen.findByRole('heading', { level: 1, name })).toBeInTheDocument()
  })

  it('disables the form while signing in', async () => {
    let finish
    vi.mocked(login).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = renderPage()

    await signInAs(user)

    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent('Signing in…')
    expect(emailField()).toBeDisabled()
    finish(SESSION)
    await screen.findByRole('heading', { level: 1, name: 'My dashboard' })
  })

  it('shows a wrong password as one message and stays signed out', async () => {
    vi.mocked(login).mockRejectedValue(new ApiError('Invalid email or password', { status: 401 }))
    const user = renderPage('/dashboard')

    await signInAs(user)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'))
    expect(screen.queryByText('Please sign in to continue.')).not.toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
    expect(getSession()).toBeNull()
  })

  it('never shows raw JavaScript errors', async () => {
    vi.mocked(login).mockRejectedValue(new TypeError('boom'))
    const user = renderPage()

    await signInAs(user)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.'),
    )
  })

  it('shows and hides the password', async () => {
    const user = renderPage()
    await user.type(passwordField(), 'secret-123')
    expect(passwordField()).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordField()).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordField()).toHaveAttribute('type', 'password')
    expect(passwordField()).toHaveValue('secret-123')
  })

  it('switches to Create account', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('link', { name: 'Create account' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create your account')
  })

  it('shows the brand panel with the ticket flow', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'ACME Facilities Incident Desk' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Report it once. Follow it until it’s fixed.')).toBeInTheDocument()
    const flow = screen.getByRole('list', { name: 'How a ticket moves' })
    expect(within(flow).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Open', 'In Progress', 'Resolved', 'Closed'])
  })
})

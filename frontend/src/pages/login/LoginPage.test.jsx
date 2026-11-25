import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WAKE_UP_HINT } from '../../components/StateViews'
import { ApiError } from '../../services/apiClient'
import { warmUp } from '../../services/healthApi'
import { makeAuth, renderWithProviders } from '../../test/renderWithProviders'
import LoginPage from './LoginPage'

vi.mock('../../services/healthApi', () => ({ warmUp: vi.fn() }))

function renderLogin(authOverrides = {}) {
  const auth = makeAuth({ isAuthenticated: false, user: null, ...authOverrides })
  renderWithProviders(<LoginPage />, { route: '/login', path: '/login', auth })
  return { auth, user: userEvent.setup() }
}

describe('LoginPage', () => {
  beforeEach(() => {
    warmUp.mockReset().mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts waking the database once when the form opens', () => {
    renderLogin()
    expect(warmUp).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('ignores a failed wake-up call: no error and the form still works', async () => {
    warmUp.mockResolvedValue(false) // what warmUp reports when the API or the database cannot be reached
    const { auth, user } = renderLogin({ login: vi.fn().mockResolvedValue({ role: 'admin' }) })
    await user.type(screen.getByLabelText(/Email/), 'admin@acme.com')
    await user.type(screen.getByLabelText(/Password/), 'Admin@123')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.login).toHaveBeenCalledWith('admin@acme.com', 'Admin@123')
    expect(await screen.findByTestId('navigated-away')).toBeInTheDocument()
  })

  it('explains a sign-in that takes longer than 3 seconds and hides the hint when it finishes', async () => {
    // fireEvent instead of user-event: Testing Library's async wrapper cannot advance Vitest fake timers.
    vi.useFakeTimers()
    let failLogin
    const login = vi.fn(() => new Promise((_resolve, reject) => (failLogin = reject)))
    renderLogin({ login })
    // The polite live region exists (empty) before the hint, so screen readers announce the change.
    const hintRegion = screen.getByRole('status')
    expect(hintRegion).toHaveAttribute('aria-live', 'polite')
    expect(hintRegion).toBeEmptyDOMElement()

    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'admin@acme.com' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'Admin@123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(login).toHaveBeenCalledWith('admin@acme.com', 'Admin@123')
    const button = screen.getByRole('button', { name: 'Signing in…' })
    expect(button).toBeDisabled()
    act(() => vi.advanceTimersByTime(2999))
    expect(hintRegion).toBeEmptyDOMElement()
    act(() => vi.advanceTimersByTime(1))
    expect(hintRegion).toHaveTextContent(WAKE_UP_HINT)
    expect(button.compareDocumentPosition(hintRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => failLogin(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })))
    expect(hintRegion).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('validates the form before calling the API', async () => {
    const { auth, user } = renderLogin()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Email/), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('logs in and navigates to the dashboard', async () => {
    const { auth, user } = renderLogin({ login: vi.fn().mockResolvedValue({ role: 'admin' }) })
    await user.type(screen.getByLabelText(/Email/), ' admin@acme.com ')
    await user.type(screen.getByLabelText(/Password/), 'Admin@123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.login).toHaveBeenCalledWith('admin@acme.com', 'Admin@123')
    expect(await screen.findByTestId('navigated-away')).toBeInTheDocument()
  })

  it('shows the API error for bad credentials', async () => {
    const login = vi.fn().mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }))
    const { user } = renderLogin({ login })
    await user.type(screen.getByLabelText(/Email/), 'admin@acme.com')
    await user.type(screen.getByLabelText(/Password/), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows why the previous session ended and can reveal the password', async () => {
    const { user } = renderLogin({ sessionMessage: 'Your session has expired, please log in again' })
    expect(screen.getByText('Your session has expired, please log in again')).toBeInTheDocument()
    const password = screen.getByLabelText(/Password/)
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
  })

  it('redirects away when already logged in (without the wake-up call)', () => {
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login', auth: makeAuth() })
    expect(screen.getByTestId('navigated-away')).toBeInTheDocument()
    expect(warmUp).not.toHaveBeenCalled()
  })
})

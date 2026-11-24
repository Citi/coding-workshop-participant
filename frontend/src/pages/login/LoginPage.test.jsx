import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { makeAuth, renderWithProviders } from '../../test/renderWithProviders'
import LoginPage from './LoginPage'

function renderLogin(authOverrides = {}) {
  const auth = makeAuth({ isAuthenticated: false, user: null, ...authOverrides })
  renderWithProviders(<LoginPage />, { route: '/login', path: '/login', auth })
  return { auth, user: userEvent.setup() }
}

describe('LoginPage', () => {
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

  it('redirects away when already logged in', () => {
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login', auth: makeAuth() })
    expect(screen.getByTestId('navigated-away')).toBeInTheDocument()
  })
})

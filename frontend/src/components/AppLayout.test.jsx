import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeAuth, renderWithProviders } from '../test/renderWithProviders'
import AppLayout from './AppLayout'
import { RequireAuth, RequirePermission } from './RouteGuards'

describe('AppLayout navigation', () => {
  it('shows every section to an admin', () => {
    renderWithProviders(<AppLayout />, { role: 'admin' })
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const label of ['Dashboard', 'Projects', 'Deliverables', 'Resources', 'Budget', 'Users']) {
      expect(nav).toHaveTextContent(label)
    }
  })

  it('hides user management from other roles', () => {
    renderWithProviders(<AppLayout />, { role: 'viewer' })
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).not.toHaveTextContent('Users')
    expect(screen.getByText('Viewer')).toBeInTheDocument()
  })

  it('logs out', async () => {
    const auth = makeAuth()
    renderWithProviders(<AppLayout />, { route: '/', path: '/', auth })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    expect(auth.logout).toHaveBeenCalled()
    expect(await screen.findByTestId('navigated-away')).toBeInTheDocument()
  })
})

describe('Route guards', () => {
  it('redirects anonymous users to the login page', () => {
    renderWithProviders(<RequireAuth><p>Secret</p></RequireAuth>, { route: '/projects', path: '/projects', auth: makeAuth({ isAuthenticated: false }) })
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
    expect(screen.getByTestId('navigated-away')).toBeInTheDocument()
  })

  it('renders protected content for logged-in users', () => {
    renderWithProviders(<RequireAuth><p>Secret</p></RequireAuth>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })

  it('shows access denied when the role lacks the permission', () => {
    renderWithProviders(<RequirePermission permission="users:read"><p>Users</p></RequirePermission>, { role: 'manager' })
    expect(screen.getByText(/Access denied/)).toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
  })
})

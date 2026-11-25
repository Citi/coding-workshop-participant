// Test helper: render a component with theme, router, notifications and a fake logged-in user.
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthContext } from '../context/authContext'
import { NotificationProvider } from '../context/NotificationProvider'
import { theme } from '../theme'

const DOMAIN = ['projects', 'deliverables', 'resources', 'allocations', 'expenses']
const grant = (actions) => DOMAIN.flatMap((resource) => actions.map((action) => `${resource}:${action}`))

/** Mirror of the backend RBAC matrix (backend/pm-service/app/auth/permissions.py). */
export const ROLE_PERMISSIONS = {
  admin: [...grant(['read', 'create', 'update', 'delete']), 'dashboard:read', 'users:read', 'users:create', 'users:update', 'users:delete'],
  manager: [...grant(['read', 'create', 'update', 'delete']), 'dashboard:read'],
  contributor: [...grant(['read', 'create', 'update']), 'dashboard:read'],
  viewer: [...grant(['read']), 'dashboard:read'],
}

/** A fake value for AuthContext. makeAuth({ role: 'viewer' }) */
export function makeAuth({ role = 'admin', permissions, ...overrides } = {}) {
  const granted = new Set(permissions || ROLE_PERMISSIONS[role])
  return {
    user: { id: 1, email: `${role}@acme.com`, full_name: `Test ${role}`, role, is_active: true, permissions: [...granted] },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    can: (permission) => granted.has(permission),
    sessionMessage: '',
    clearSessionMessage: vi.fn(),
    ...overrides,
  }
}

/**
 * renderWithProviders(<ProjectsPage />, { role: 'viewer' })
 * renderWithProviders(<ProjectDetailPage />, { route: '/projects/5', path: '/projects/:projectId' })
 */
export function renderWithProviders(ui, { route = '/', path, auth, role, extraRoutes = [] } = {}) {
  const authValue = auth || makeAuth({ role })
  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
      {extraRoutes.map((extra) => (
        <Route key={extra.path} path={extra.path} element={extra.element} />
      ))}
      <Route path="*" element={<div data-testid="navigated-away" />} />
    </Routes>
  ) : (
    ui
  )
  const result = render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[route]}>
        <NotificationProvider>
          <AuthContext.Provider value={authValue}>{content}</AuthContext.Provider>
        </NotificationProvider>
      </MemoryRouter>
    </ThemeProvider>,
  )
  return { ...result, auth: authValue }
}

/** Minimal fetch Response stand-in for API client tests. */
export function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  }
}

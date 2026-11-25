// Test data for the users tests: the API's user object (docs/API.md › Users).

export function makeUser(overrides = {}) {
  return {
    id: 5,
    email: 'jane@acme.com',
    full_name: 'Jane Doe',
    role: 'manager',
    is_active: true,
    created_at: '2026-11-24T10:00:00+00:00',
    updated_at: '2026-11-24T10:00:00+00:00',
    ...overrides,
  }
}

/** The logged-in admin: makeAuth() in renderWithProviders signs in user id 1. */
export const SELF = makeUser({
  id: 1,
  email: 'admin@acme.com',
  full_name: 'System Administrator',
  role: 'admin',
  created_at: '2026-01-05T08:00:00+00:00',
})
export const JANE = makeUser()
/** A disabled viewer. */
export const OMAR = makeUser({
  id: 7,
  email: 'omar.haddad.long-address@acme.com',
  full_name: 'Omar Haddad',
  role: 'viewer',
  is_active: false,
  created_at: '2026-03-10T12:30:00+00:00',
})

/** GET /users response body. */
export function listOf(...users) {
  return { items: users, total: users.length }
}

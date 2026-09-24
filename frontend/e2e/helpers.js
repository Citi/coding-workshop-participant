import { expect } from '@playwright/test'

import { sql } from './db.js'

export const PASSWORD = 'e2e-password-123'

/**
 * Give a user a role directly in the e2e database, for test setup. Quicker than the admin
 * API, and the only way to make an admin.
 * @param {number} userId
 * @param {'employee'|'engineer'|'admin'} role
 */
export function setRole(userId, role) {
  if (!['employee', 'engineer', 'admin'].includes(role)) throw new Error(`Unknown role "${role}"`)
  sql(`UPDATE users SET role_id = (SELECT role_id FROM roles WHERE role_name = '${role}')
       WHERE user_id = ${Number(userId)}`)
}

/** A unique @acme.inc email, so tests never collide within a run. */
export function uniqueEmail(name) {
  return `${name}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@acme.inc`
}

/** Register through the API (via the app's own /api proxy) and return the user. */
export async function registerViaApi(request, { name = 'E2E Employee', email = uniqueEmail('e2e') } = {}) {
  const response = await request.post('/api/core/auth/register', {
    data: { email, full_name: name, password: PASSWORD },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

/**
 * Register an engineer. The role is set in SQL: quicker than the admin API for test setup.
 * @param {string} name full name; make it unique if a test picks it from a dropdown
 */
export async function registerEngineer(request, name) {
  const engineer = await registerViaApi(request, { name, email: uniqueEmail('engineer') })
  setRole(engineer.user_id, 'engineer')
  return engineer
}

/** Register a Facility Admin (role set in SQL, since only SQL can make admins). */
export async function registerAdmin(request) {
  const admin = await registerViaApi(request, { name: 'Ada Admin', email: uniqueEmail('admin') })
  setRole(admin.user_id, 'admin')
  return admin
}

/** Sign in through the API and return the Authorization header for that user. */
export async function signInViaApi(request, email, password = PASSWORD) {
  const response = await request.post('/api/core/auth/login', { data: { email, password } })
  expect(response.status()).toBe(200)
  const { access_token: accessToken } = await response.json()
  return { Authorization: `Bearer ${accessToken}` }
}

/** Create a building-wide ticket in Building A through the API, as the given user. */
export async function createTicketViaApi(request, user, overrides = {}) {
  const headers = await signInViaApi(request, user.email)
  const buildings = await (await request.get('/api/core/buildings', { headers })).json()
  const response = await request.post('/api/core/tickets', {
    headers,
    data: {
      title: 'Lobby door sticks',
      description: 'The main lobby door needs a hard push.',
      category: 'building_facilities',
      affected_scope: 'building',
      building_id: buildings.find((b) => b.building_name === 'Building A').building_id,
      ...overrides,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

/**
 * Sign in through the real form and wait for the role's start page.
 * @param {{password?: string, home?: string | RegExp}} [options] home: the start page's h1
 */
/** The employee dashboard's h1, a time-of-day greeting: "Good morning, Priya". */
export const EMPLOYEE_HOME = /^Good (morning|afternoon|evening), /

export async function signIn(page, email, { password = PASSWORD, home = EMPLOYEE_HOME } = {}) {
  await page.goto('/login')
  await page.getByLabel(/^Work email/).fill(email)
  await page.getByLabel(/^Password/).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: home })).toBeVisible()
}

/**
 * Go to a sidebar page on a tablet or phone, where the sidebar sits behind the menu
 * button, and wait for the drawer to close again.
 * @param {string} link the nav link's name, e.g. "People"
 */
export async function goViaMenu(page, link) {
  await page.getByRole('button', { name: 'Open menu' }).click()
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: link }).click()
  await expect(nav).toHaveCount(0)
}

/** Pick an option from an MUI select by its label. */
export async function choose(page, label, option) {
  await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

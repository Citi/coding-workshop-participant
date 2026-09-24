import { expect, test } from '@playwright/test'

import { choose, PASSWORD, uniqueEmail } from './helpers.js'

/**
 * The critical employee path, end to end through the UI:
 * register -> sign in -> create a ticket (recorded as opened) -> add a note -> escalate -> see it on the
 * dashboard -> search -> sign out.
 */
test('an employee reports an issue and follows it through', async ({ page }) => {
  const email = uniqueEmail('jordan')
  const title = `Desk lamp flickers ${Date.now()}`

  // How the browser identifies itself on every protected API call.
  const authHeaders = []
  page.on('request', (request) => {
    if (request.url().includes('/api/core/tickets')) authHeaders.push(request.headers())
  })

  // Every tickets API response the browser gets, to check what the employee receives.
  const ticketResponses = []
  page.on('response', async (response) => {
    if (response.url().includes('/api/core/tickets') && response.request().method() !== 'OPTIONS') {
      ticketResponses.push(await response.text())
    }
  })

  await test.step('register with a company email', async () => {
    await page.goto('/register')
    await page.getByLabel(/^Full name/).fill('Jordan Lee')
    await page.getByLabel(/^Work email/).fill(email)
    await page.getByLabel(/^Password/).fill(PASSWORD)
    await page.getByLabel(/^Confirm password/).fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('alert')).toHaveText(`Account created for ${email}. Please sign in.`)
    await expect(page.getByLabel(/^Work email/)).toHaveValue(email)
  })

  await test.step('sign in and see an empty dashboard', async () => {
    await page.getByLabel(/^Password/).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Jordan$/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: "You haven't reported any issues yet" })).toBeVisible()
  })

  await test.step('create a ticket, choosing Building -> Floor -> Seat', async () => {
    await page.getByRole('main').getByRole('link', { name: 'Report an issue' }).click()
    await page.getByLabel(/^Title/).fill(title)
    await page.getByRole('radio', { name: 'Electrical / Power' }).check()
    await page.getByLabel(/^Full description/).fill('Started this morning. Hard to read.')
    await page.getByRole('radio', { name: /^Just me/ }).check()
    await choose(page, 'Building', 'Building A')
    await choose(page, 'Floor', 'Floor 3')
    await choose(page, 'Seat', 'Seat 301')
    await page.getByRole('button', { name: 'Submit ticket' }).click()

    await expect(page).toHaveURL(/\/tickets\/\d+$/)
    await expect(page.getByText('Ticket created.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title)
    await expect(page.locator('[aria-current="step"]')).toContainText('Open (current status)')
    const details = page.getByRole('region', { name: 'Details' })
    await expect(details).toContainText('Building A · Floor 3 · Seat 301')
    await expect(details).toContainText('Not assigned yet')

    const history = page.getByRole('list', { name: 'Status history' }).getByRole('listitem')
    await expect(history).toHaveCount(1)
    await expect(history).toContainText('Opened')
    await expect(history).toContainText('You · Employee')
  })

  await test.step('add a note', async () => {
    const notes = page.getByRole('region', { name: 'Notes' })
    await expect(notes.getByText('No notes yet.')).toBeVisible()
    await notes.getByRole('textbox', { name: 'Add a note' }).fill('It is getting worse.')
    await notes.getByRole('button', { name: 'Add note' }).click()

    await expect(notes.getByRole('listitem')).toHaveCount(1)
    await expect(notes.getByRole('listitem')).toContainText('You · Employee')
    await expect(notes.getByRole('listitem')).toContainText('It is getting worse.')
  })

  await test.step('request escalation', async () => {
    const escalation = page.getByRole('region', { name: 'Escalation' })
    await escalation.getByRole('button', { name: 'Request escalation' }).click()
    const dialog = page.getByRole('dialog', { name: 'Request escalation' })
    await dialog.getByRole('textbox').fill('I cannot read my documents.')
    await dialog.getByRole('button', { name: 'Request escalation' }).click()

    await expect(dialog).toBeHidden()
    await expect(escalation).toContainText('Escalation requested.')
    await expect(escalation).toContainText('Your reason: I cannot read my documents.')
  })

  await test.step('see it on the dashboard and find it by search', async () => {
    await page.getByRole('link', { name: 'Back to dashboard' }).click()

    await expect(page.getByRole('region', { name: title })).toContainText('Your active ticket')
    await expect(page.getByText(/^1 active ticket · last update /)).toBeVisible()
    const table = page.getByRole('table', { name: 'My tickets' })
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table).toContainText('Just me')

    await page.getByRole('searchbox', { name: 'Search' }).fill('no such ticket')
    await expect(page.getByText('No tickets match these filters.')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search' }).fill('lamp')
    await expect(table.getByRole('row')).toHaveCount(2)
  })

  await test.step('sign out, and protected pages need sign-in again', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('alert')).toHaveText("You've signed out.")

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('alert')).toHaveText('Please sign in to continue.')
  })

  await test.step('every tickets call sent a Bearer token, never X-User-Id', async () => {
    expect(authHeaders.length).toBeGreaterThan(5)
    for (const headers of authHeaders) {
      expect(headers.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)
      expect(headers).not.toHaveProperty('x-user-id')
    }
  })

  await test.step('no tickets response ever carried a priority', async () => {
    expect(ticketResponses.length).toBeGreaterThan(5)
    for (const body of ticketResponses) expect(body).not.toContain('priority')
    await expect(page.locator('body')).not.toContainText(/priority|\bP[123]\b/i)
  })
})

import { expect, test } from '@playwright/test'

import { sql } from './db.js'
import { createTicketViaApi, PASSWORD, registerViaApi, setRole, signIn, uniqueEmail } from './helpers.js'

test('an employee cannot open another employee\'s ticket', async ({ page, request }) => {
  const owner = await registerViaApi(request, { name: 'Ticket Owner' })
  const ticket = await createTicketViaApi(request, owner)
  const other = await registerViaApi(request, { name: 'Someone Else' })

  await signIn(page, other.email)
  await page.goto(`/tickets/${ticket.ticket_id}`)

  await expect(page.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeVisible()
  await expect(page.getByText(ticket.title)).toHaveCount(0)
})

test('a blocked ticket shows the engineer\'s reason next to Blocked', async ({ page, request }) => {
  const owner = await registerViaApi(request, { name: 'Blocked Owner' })
  const ticket = await createTicketViaApi(request, owner)
  // Stand-in for an engineer: the employee API can't block tickets.
  sql(
    `UPDATE tickets SET status = 'blocked', blocked_reason = 'Waiting for a replacement part'
     WHERE ticket_id = ${Number(ticket.ticket_id)}`,
  )

  await signIn(page, owner.email)
  await page.goto(`/tickets/${ticket.ticket_id}`)

  const current = page.locator('[aria-current="step"]')
  await expect(current).toContainText('In Progress (paused while blocked)')
  await expect(current).toContainText('Blocked: Waiting for a replacement part')
})

test('a reopened ticket keeps every step in its status history', async ({ page, request }) => {
  const owner = await registerViaApi(request, { name: 'Reopen Owner' })
  const ticket = await createTicketViaApi(request, owner)
  const engineer = await registerViaApi(request, { name: 'Sam Tech', email: uniqueEmail('engineer') })
  const ticketId = Number(ticket.ticket_id)
  const engineerId = Number(engineer.user_id)
  // Stand-in for an engineer working the ticket: no API changes status yet.
  setRole(engineerId, 'engineer')
  sql(`INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by_user_id, reason) VALUES
       (${ticketId}, 'open', 'in_progress', ${engineerId}, NULL),
       (${ticketId}, 'in_progress', 'resolved', ${engineerId}, NULL),
       (${ticketId}, 'resolved', 'open', ${engineerId}, 'Door stuck again this morning')`)
  sql(`UPDATE tickets SET status = 'open' WHERE ticket_id = ${ticketId}`)

  await signIn(page, owner.email)
  await page.goto(`/tickets/${ticketId}`)

  const rows = page.getByRole('list', { name: 'Status history' }).getByRole('listitem')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0)).toContainText('Opened')
  await expect(rows.nth(0)).toContainText('You · Employee')
  await expect(rows.nth(1)).toContainText('In Progress')
  await expect(rows.nth(2)).toContainText('Resolved')
  await expect(rows.nth(3)).toContainText('Reopened → Open')
  await expect(rows.nth(3)).toContainText('Sam Tech · Engineer')
  await expect(rows.nth(3)).toContainText('Door stuck again this morning')
  await expect(page.locator('[aria-current="step"]')).toContainText('Open (current status)')
})

test('forms explain problems before and after reaching the API', async ({ page, request }) => {
  await page.goto('/register')
  await page.getByLabel(/^Work email/).fill('someone@gmail.com')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Use your @acme.inc email address.')).toBeVisible()

  const existing = await registerViaApi(request, { name: 'Already Here' })
  await page.goto('/login')
  await page.getByLabel(/^Work email/).fill(existing.email)
  await page.getByLabel(/^Password/).fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
})

test('a forged or stale token is signed out with an explanation', async ({ page }) => {
  await page.goto('/login')
  // Token-shaped, but not signed by the server: the API must reject it with 401.
  const forged = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIn0', 'bm90LWEtcmVhbC1zaWduYXR1cmU']
  await page.evaluate((token) =>
    localStorage.setItem('helpdesk.session', JSON.stringify({ token, user: { user_id: 1, full_name: 'Ghost', role: 'employee' } })),
  forged.join('.'))

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('alert')).toHaveText('Your session has ended. Please sign in again.')
})

test('an engineer lands on their own queue and never calls the employee API', async ({ page, request }) => {
  const engineer = await registerViaApi(request, { name: 'Sam Tech', email: uniqueEmail('engineer') })
  setRole(engineer.user_id, 'engineer')
  const ticketCalls = []
  page.on('response', (response) => {
    if (response.url().includes('/api/core/tickets')) ticketCalls.push(response.status())
  })

  await page.goto('/login')
  await page.getByLabel(/^Work email/).fill(engineer.email)
  await page.getByLabel(/^Password/).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/engineer$/)
  await expect(page.getByRole('heading', { level: 1, name: 'My queue' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Engineer')

  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { level: 1, name: "You don't have access to this" })).toBeVisible()
  await page.getByRole('link', { name: 'Go to my start page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My queue' })).toBeVisible()

  expect(ticketCalls).toEqual([])
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('sign in and register fit the screen, with the form near the top', async ({ page }) => {
    for (const [path, title] of [['/login', 'Sign in'], ['/register', 'Create your account']]) {
      await page.goto(path)
      const heading = page.getByRole('heading', { level: 1, name: title })
      await expect(heading).toBeVisible()
      // The brand panel shrinks to a short header, so the form starts in the first screen.
      expect((await heading.boundingBox()).y).toBeLessThan(400)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    }
  })

  test('the dashboard and ticket details fit the screen', async ({ page, request }) => {
    const owner = await registerViaApi(request, { name: 'Phone User', email: uniqueEmail('phone') })
    const ticket = await createTicketViaApi(request, owner)

    await signIn(page, owner.email)
    await expect(page.getByRole('link', { name: 'ACME Facilities Incident Desk' })).toBeVisible()
    // The sidebar lives behind the menu button on phones.
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Open menu' }).click()
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link')).toHaveText(['Dashboard', 'Report an issue'])
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    await page.keyboard.press('Escape')
    await expect(nav).toHaveCount(0)
    await expect(page.getByRole('table')).toHaveCount(0)
    // On phones the list is cards; each card is one link to the ticket.
    const card = page.getByRole('region', { name: 'My tickets' }).getByRole('link', { name: new RegExp(`^#${ticket.ticket_id} `) })
    await expect(card).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    await card.click()
    await expect(page.getByRole('list', { name: 'Ticket workflow' })).toHaveCSS('flex-direction', 'column')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true })

  test('the sidebar opens as a drawer and closes after navigating', async ({ page, request }) => {
    const owner = await registerViaApi(request, { name: 'Tablet User', email: uniqueEmail('tablet') })

    await signIn(page, owner.email)
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Report an issue' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Report an issue' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})

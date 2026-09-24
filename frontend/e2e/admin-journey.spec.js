import { expect, test } from '@playwright/test'

import { sql } from './db.js'
import {
  choose,
  createTicketViaApi,
  goViaMenu,
  registerAdmin,
  registerEngineer,
  registerViaApi,
  signIn,
  signInViaApi,
  uniqueEmail,
} from './helpers.js'

const ADMIN_HOME = 'Facility Admin dashboard'

/**
 * Three tickets from two employees, with a unique stamp in every title so other tests'
 * tickets in the shared e2e database can be filtered out by searching for it:
 *   lights   P1  building-wide  unassigned
 *   wifi     P3  one seat       unassigned, escalated, with the employee's note
 *   printer  P1  building-wide  assigned to an engineer, in progress
 */
async function seedTickets(request) {
  const stamp = Date.now()
  const dana = await registerViaApi(request, { name: 'Dana Requester', email: uniqueEmail('dana') })
  const lee = await registerViaApi(request, { name: 'Lee Requester', email: uniqueEmail('lee') })
  const engineer = await registerEngineer(request, 'Sam Tech')

  const [floorId, seatId] = sql(`SELECT f.floor_id || '|' || s.seat_id
    FROM seats s JOIN floors f USING (floor_id) JOIN buildings b USING (building_id)
    WHERE b.building_name = 'Building A' AND f.floor_number = 3 AND s.seat_number = '301'`)
    .split('|')
    .map(Number)

  const lights = await createTicketViaApi(request, dana, { title: `Lobby lights ${stamp}` })
  const wifi = await createTicketViaApi(request, lee, {
    title: `Wi-Fi drops ${stamp}`,
    category: 'network',
    affected_scope: 'me',
    floor_id: floorId,
    seat_id: seatId,
  })
  const printer = await createTicketViaApi(request, dana, { title: `Printer jam ${stamp}`, category: 'printer' })

  const leeHeaders = await signInViaApi(request, lee.email)
  expect((await request.post(`/api/core/tickets/${wifi.ticket_id}/notes`, {
    headers: leeHeaders, data: { note_text: 'Still dropping after a restart.' },
  })).status()).toBe(201)
  expect((await request.post(`/api/core/tickets/${wifi.ticket_id}/escalation`, {
    headers: leeHeaders, data: { reason: 'I have client calls all afternoon.' },
  })).status()).toBe(200)
  // Assigned and already started: no API changes status yet, so this is set directly.
  sql(`UPDATE tickets SET assigned_to_user_id = ${Number(engineer.user_id)}, status = 'in_progress',
       assigned_at = now() WHERE ticket_id = ${Number(printer.ticket_id)}`)

  return { stamp, lee, lights, wifi, printer }
}

/**
 * The Facility Admin's A1 path, through the UI: sign in -> see the unassigned queue ->
 * search and filter all tickets -> open an escalated ticket's details -> back.
 */
test('an admin triages every ticket from their dashboard', async ({ page, request }) => {
  const { stamp, lee, lights, wifi, printer } = await seedTickets(request)
  const admin = await registerAdmin(request)

  // The admin page must never fall back to the employee-only tickets API.
  const employeeApiCalls = []
  page.on('request', (req) => {
    if (req.url().includes('/api/core/tickets')) employeeApiCalls.push(req.url())
  })

  await test.step('sign in and land on the admin dashboard', async () => {
    await signIn(page, admin.email, { home: ADMIN_HOME })
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Facility Admin')
  })

  const queue = page.getByRole('region', { name: /Needs an engineer/ })

  await test.step('the unassigned queue shows new tickets with their priority', async () => {
    const lightsCard = queue.getByRole('listitem').filter({ hasText: lights.title })
    await expect(lightsCard.getByLabel('Priority P1: Building-wide')).toBeVisible()
    await expect(lightsCard).toContainText('Dana Requester · waiting')

    const wifiCard = queue.getByRole('listitem').filter({ hasText: wifi.title })
    await expect(wifiCard.getByLabel('Priority P3: One person')).toBeVisible()
    await expect(wifiCard.getByText('Escalated')).toBeVisible()

    // Assigned tickets don't need an engineer.
    await expect(queue.getByText(printer.title)).toHaveCount(0)
  })

  const table = page.getByRole('table', { name: 'All tickets' })
  const titles = () => table.getByRole('row').getByRole('link')

  await test.step('search all tickets, then narrow with filters', async () => {
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    // Triage order: the two P1s oldest first, then the P3.
    await expect(titles()).toHaveText([lights.title, printer.title, wifi.title])
    const printerRow = table.getByRole('row').filter({ hasText: printer.title })
    await expect(printerRow).toContainText('Sam Tech')
    await expect(printerRow).toContainText('In Progress')

    await choose(page, 'Assignment', 'Unassigned')
    await expect(titles()).toHaveText([lights.title, wifi.title])

    await page.getByRole('switch', { name: 'Escalated only' }).check()
    await expect(titles()).toHaveText([wifi.title])

    await page.getByRole('switch', { name: 'Escalated only' }).uncheck()
    await choose(page, 'Assignment', 'Assigned or not')
    await choose(page, 'Priority', 'P1 · Building-wide')
    await expect(titles()).toHaveText([lights.title, printer.title])
  })

  await test.step('search by the requester\'s email', async () => {
    await choose(page, 'Priority', 'All priorities')
    await page.getByRole('searchbox', { name: 'Search' }).fill(lee.email)
    await expect(titles()).toHaveText([wifi.title])
  })

  await test.step('open the escalated ticket: priority, requester, reason and notes', async () => {
    await titles().first().click()
    await expect(page).toHaveURL(new RegExp(`/admin/tickets/${wifi.ticket_id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${wifi.ticket_id} ${wifi.title}`)
    await expect(page.getByLabel('Priority P3: One person')).toBeVisible()

    const escalation = page.getByRole('alert')
    await expect(escalation).toContainText('Lee Requester asked for an admin to review this ticket')
    await expect(escalation).toContainText('I have client calls all afternoon.')

    const requester = page.getByRole('region', { name: 'Requester' })
    await expect(requester.getByRole('link', { name: lee.email })).toHaveAttribute('href', `mailto:${lee.email}`)

    const notes = page.getByRole('region', { name: 'Notes' })
    await expect(notes).toContainText('Still dropping after a restart.')
    await expect(notes.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Status history' })).toContainText('Lee Requester')
  })

  await test.step('go back to the dashboard', async () => {
    await page.getByRole('link', { name: 'Back to admin dashboard' }).click()
    await expect(page.getByRole('heading', { level: 1, name: ADMIN_HOME })).toBeVisible()
  })

  expect(employeeApiCalls).toEqual([])
})

/**
 * A2 through the UI: quick-assign from the queue -> the engineer's workload -> filter by
 * them -> assign and reassign from a ticket's details. The employee sees who has it.
 */
test('an admin assigns and reassigns tickets to engineers', async ({ page, request }) => {
  const { stamp, lee, lights, wifi } = await seedTickets(request)
  // Names unique to this run, so dropdown options can't collide with other tests' engineers.
  const ada = await registerEngineer(request, `Ada Wrench ${stamp}`)
  const bo = await registerEngineer(request, `Bo Pliers ${stamp}`)
  const admin = await registerAdmin(request)
  const queue = page.getByRole('region', { name: /Needs an engineer/ })
  const workload = page.getByRole('region', { name: 'Engineer workload' })

  await signIn(page, admin.email, { home: ADMIN_HOME })

  await test.step('quick-assign the P1 from the queue', async () => {
    const card = queue.getByRole('listitem').filter({ hasText: lights.title })
    await card.getByRole('combobox', { name: 'Assign to' }).click()
    await page.getByRole('option', { name: `${ada.full_name} · 0 active`, exact: true }).click()
    await card.getByRole('button', { name: 'Assign' }).click()

    await expect(page.getByText(`#${lights.ticket_id} assigned to ${ada.full_name}.`)).toBeVisible()
    await expect(queue.getByText(lights.title)).toHaveCount(0)
  })

  await test.step('the workload shows it, and filters All tickets to that engineer', async () => {
    const adaCard = workload.getByRole('button', { name: new RegExp(`^${ada.full_name}: 1 active`) })
    await expect(adaCard).toContainText('1 open · 0 in progress · 0 blocked')
    await expect(adaCard).toContainText('1 P1')

    await adaCard.click()
    await expect(adaCard).toHaveAttribute('aria-pressed', 'true')
    const table = page.getByRole('table', { name: 'All tickets' })
    await expect(table.getByRole('row').getByRole('link')).toHaveText([lights.title])
    await expect(table.getByRole('row').filter({ hasText: lights.title })).toContainText(ada.full_name)
  })

  await test.step('assign, then reassign, from the ticket details', async () => {
    await page.goto(`/admin/tickets/${wifi.ticket_id}`)
    const panel = page.getByRole('region', { name: 'Assignment' })
    await expect(panel).toContainText('No engineer yet.')

    await panel.getByRole('combobox', { name: 'Engineer' }).click()
    await page.getByRole('option', { name: `${ada.full_name} · 1 active, 1 P1`, exact: true }).click()
    await panel.getByRole('button', { name: 'Assign' }).click()
    await expect(panel.getByRole('alert')).toHaveText(`Assigned to ${ada.full_name}.`)
    await expect(page.getByRole('region', { name: 'Details' })).toContainText(ada.full_name)

    await panel.getByRole('combobox', { name: 'Engineer' }).click()
    await expect(page.getByRole('option', { name: new RegExp(`^${ada.full_name} .*\\(current\\)$`) })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await page.getByRole('option', { name: `${bo.full_name} · 0 active`, exact: true }).click()
    await panel.getByRole('button', { name: 'Reassign' }).click()
    await expect(panel.getByRole('alert')).toHaveText(`Assigned to ${bo.full_name}.`)
    await expect(page.getByRole('region', { name: 'Details' })).toContainText(bo.full_name)
    // Assigning doesn't start the work: the ticket is still open until the engineer moves it.
    await expect(page.getByRole('list', { name: 'Ticket workflow' })).toContainText('Open (current status)')
  })

  await test.step('the employee sees who has their ticket, still without priority', async () => {
    const response = await request.get(`/api/core/tickets/${wifi.ticket_id}`, {
      headers: await signInViaApi(request, lee.email),
    })
    const ticket = await response.json()
    expect(ticket.assigned_to_name).toBe(bo.full_name)
    expect(ticket.acknowledged_at).not.toBeNull()
    expect(ticket).not.toHaveProperty('priority')
  })
})

/**
 * A3 through the UI: the People page from the header -> promote an employee (they're
 * signed out and come back as an engineer) -> an engineer with work can't be moved back,
 * and the refusal links to their tickets.
 */
test('an admin promotes an employee and manages engineers from People', async ({ page, browser, request }) => {
  const stamp = Date.now()
  const ren = await registerViaApi(request, { name: `Ren Newhire ${stamp}`, email: uniqueEmail('ren') })
  const busy = await registerEngineer(request, `Busy Bee ${stamp}`)
  const admin = await registerAdmin(request)
  const ticket = await createTicketViaApi(request, ren, { title: `Heater rattles ${stamp}` })
  const assigned = await request.put(`/api/core/admin/tickets/${ticket.ticket_id}/assignment`, {
    headers: await signInViaApi(request, admin.email),
    data: { engineer_id: busy.user_id },
  })
  expect(assigned.status()).toBe(200)

  // Ren is signed in elsewhere, as an employee, while the admin promotes them.
  const renPage = await (await browser.newContext()).newPage()
  await signIn(renPage, ren.email)

  await signIn(page, admin.email, { home: ADMIN_HOME })
  const people = page.getByRole('table', { name: 'People' })
  const rowFor = (name) => people.getByRole('row').filter({ hasText: name })

  await test.step('open People from the header and find Ren', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'People' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(people.getByRole('row')).toHaveCount(3) // header + Ren + Busy Bee
    await expect(rowFor(ren.full_name).getByRole('combobox', { name: 'Role' })).toHaveText('Employee')
  })

  await test.step('promote Ren after confirming', async () => {
    await rowFor(ren.full_name).getByRole('combobox', { name: 'Role' }).click()
    await page.getByRole('option', { name: 'Engineer' }).click()
    const dialog = page.getByRole('dialog', { name: `Make ${ren.full_name} an engineer?` })
    await expect(dialog).toContainText("They'll be signed out and need to sign in again.")
    await dialog.getByRole('button', { name: 'Make engineer' }).click()

    await expect(page.getByText(`${ren.full_name} is now an engineer. They'll need to sign in again.`)).toBeVisible()
    await expect(rowFor(ren.full_name).getByRole('combobox', { name: 'Role' })).toHaveText('Engineer')
  })

  await test.step('Ren is signed out, and signs back in as an engineer', async () => {
    await renPage.reload()
    await expect(renPage).toHaveURL(/\/login$/)
    await expect(renPage.getByRole('alert')).toHaveText('Your session has ended. Please sign in again.')
    await signIn(renPage, ren.email, { home: 'My queue' })
    await renPage.context().close()
  })

  await test.step('an engineer with an active ticket can\'t go back to employee', async () => {
    await rowFor(busy.full_name).getByRole('combobox', { name: 'Role' }).click()
    await page.getByRole('option', { name: 'Employee' }).click()
    const dialog = page.getByRole('dialog', { name: `Move ${busy.full_name} back to employee?` })
    await dialog.getByRole('button', { name: 'Make employee' }).click()

    await expect(dialog.getByRole('alert')).toContainText(`${busy.full_name} still has 1 active ticket. Reassign them first.`)
    await dialog.getByRole('link', { name: 'See their tickets' }).click()

    await expect(page).toHaveURL(new RegExp(`/admin\\?engineer=${busy.user_id}$`))
    await expect(page.getByRole('table', { name: 'All tickets' }).getByRole('row').getByRole('link')).toHaveText([ticket.title])
    // Ren is now in the workload, ready for tickets.
    await expect(
      page.getByRole('region', { name: 'Engineer workload' }).getByRole('button', { name: new RegExp(`^${ren.full_name}: 0 active`) }),
    ).toBeVisible()
  })
})

/**
 * A4 through the UI: the metric cards -> "Ready to close" lists resolved tickets -> close
 * one with a note (the employee sees it) -> send the other back to its engineer, who has
 * it again.
 */
test('an admin closes one resolved ticket and sends another back', async ({ page, request }) => {
  const stamp = Date.now()
  const employee = await registerViaApi(request, { name: 'Dana Requester', email: uniqueEmail('dana') })
  const engineer = await registerEngineer(request, `Rae Resolver ${stamp}`)
  const admin = await registerAdmin(request)
  const adminHeaders = await signInViaApi(request, admin.email)
  const engineerHeaders = await signInViaApi(request, engineer.email)

  // Two tickets the engineer has already worked and resolved, through the API.
  const resolveTicket = async (title) => {
    const ticket = await createTicketViaApi(request, employee, { title: `${title} ${stamp}` })
    const call = async (method, url, data, headers) => expect((await request[method](url, { headers, data })).status()).toBe(200)
    await call('put', `/api/core/admin/tickets/${ticket.ticket_id}/assignment`, { engineer_id: engineer.user_id }, adminHeaders)
    await call('post', `/api/core/engineer/tickets/${ticket.ticket_id}/status`, { status: 'in_progress' }, engineerHeaders)
    await call('post', `/api/core/engineer/tickets/${ticket.ticket_id}/status`, { status: 'resolved', reason: 'Fixed it' }, engineerHeaders)
    return ticket
  }
  const toClose = await resolveTicket('Door sticks')
  const toSendBack = await resolveTicket('Heater rattles')

  await signIn(page, admin.email, { home: ADMIN_HOME })
  const numbers = page.getByRole('list', { name: 'Tickets in numbers' })
  const titles = () => page.getByRole('table', { name: 'All tickets' }).getByRole('row').getByRole('link')
  const finishing = page.getByRole('region', { name: 'Finish ticket' })

  await test.step('"Ready to close" lists the resolved tickets', async () => {
    const readyCard = numbers.getByRole('button', { name: /^Ready to close: \d+/ })
    await readyCard.click()
    await expect(readyCard).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(titles()).toHaveText([toClose.title, toSendBack.title])
  })

  await test.step('close one with a note', async () => {
    await titles().first().click()
    await expect(finishing).toContainText('The engineer has resolved this.')
    await finishing.getByRole('button', { name: 'Close ticket…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Close ticket' })
    await dialog.getByRole('textbox', { name: 'Closing note' }).fill('Confirmed with Dana')
    await dialog.getByRole('button', { name: 'Close ticket' }).click()

    await expect(finishing).toContainText('Ticket closed.')
    await expect(finishing).toContainText('This ticket is closed.')
    await expect(page.getByRole('list', { name: 'Ticket workflow' })).toContainText('Closed (current status)')
    await expect(page.getByRole('region', { name: 'Status history' })).toContainText('Confirmed with Dana')

    const history = await (await request.get(`/api/core/tickets/${toClose.ticket_id}/history`, {
      headers: await signInViaApi(request, employee.email),
    })).json()
    expect([history.at(-1).to_status, history.at(-1).changed_by_role, history.at(-1).reason]).toEqual([
      'closed', 'admin', 'Confirmed with Dana',
    ])
  })

  await test.step('send the other back to its engineer', async () => {
    await page.goto(`/admin/tickets/${toSendBack.ticket_id}`)
    await finishing.getByRole('button', { name: 'Send back…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Send back to the engineer' })
    await dialog.getByRole('textbox', { name: /What's still wrong/ }).fill('Still rattles at night')
    await dialog.getByRole('button', { name: 'Send back to the engineer' }).click()

    await expect(finishing).toContainText(`Sent back to ${engineer.full_name}.`)
    await expect(page.getByRole('list', { name: 'Ticket workflow' })).toContainText('In Progress (current status)')

    const queue = await (await request.get('/api/core/engineer/tickets?status=in_progress', { headers: engineerHeaders })).json()
    expect(queue.map((t) => t.ticket_id)).toEqual([toSendBack.ticket_id])
  })

  await test.step('the dashboard counts the close', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }).click()
    await expect(numbers.getByRole('button', { name: /^Closed \(7 days\): [1-9]\d*/ })).toBeVisible()
  })
})

/**
 * F1 through the UI: open Facilities -> add a building, floor and seat (a duplicate seat
 * is refused) -> the employee can pick it -> once a ticket is there, delete is refused and
 * the admin deactivates it instead -> the employee can't pick it any more, but their
 * ticket keeps it -> the building's ticket count opens the dashboard filtered to it.
 */
test('an admin manages facilities, and employees only see active ones', async ({ page, browser, request }) => {
  const stamp = Date.now()
  const annex = `Annex ${stamp}`
  const admin = await registerAdmin(request)
  const employee = await registerViaApi(request, { name: 'Dana Requester', email: uniqueEmail('dana') })

  // The employee is signed in elsewhere, reporting issues.
  const employeePage = await (await browser.newContext()).newPage()
  await signIn(employeePage, employee.email)
  const employeeBuildings = async () => {
    await employeePage.goto('/tickets/new')
    await employeePage.getByRole('combobox', { name: /^Building/ }).click()
    await expect(employeePage.getByRole('option', { name: 'Building A', exact: true })).toBeVisible()
    const names = await employeePage.getByRole('option').allTextContents()
    await employeePage.keyboard.press('Escape')
    return names
  }

  await signIn(page, admin.email, { home: ADMIN_HOME })
  const details = page.getByRole('region', { name: annex })
  const dialog = page.getByRole('dialog')

  await test.step('open Facilities from the header', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Facilities' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Facilities' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Buildings' }).getByRole('button', { name: /^Building A/ })).toBeVisible()
  })

  await test.step('add a building, a floor and a seat', async () => {
    await page.getByRole('button', { name: 'Add building' }).click()
    await dialog.getByRole('textbox', { name: 'Building name' }).fill(annex)
    await dialog.getByRole('button', { name: 'Add building' }).click()
    await expect(page.getByText(`Added ${annex}.`)).toBeVisible()
    await expect(details.getByRole('heading', { level: 2 })).toHaveText(annex)

    await details.getByRole('button', { name: `Add a floor to ${annex}` }).click()
    await dialog.getByRole('textbox', { name: 'Floor number' }).fill('-1')
    await dialog.getByRole('button', { name: 'Add floor' }).click()
    await expect(page.getByText(`Added Floor -1 to ${annex}.`)).toBeVisible()

    await details.getByRole('button', { name: /^Floor -1,/ }).click()
    await details.getByRole('button', { name: 'Add a seat to Floor -1' }).click()
    await dialog.getByRole('textbox', { name: 'Seat number' }).fill('B-12')
    await dialog.getByRole('button', { name: 'Add seat' }).click()
    await expect(details.getByRole('group', { name: 'Seats on Floor -1' }).getByRole('button', { name: 'Seat B-12' })).toBeVisible()
  })

  await test.step('the same seat in another case is refused in the dialog', async () => {
    await details.getByRole('button', { name: 'Add a seat to Floor -1' }).click()
    await dialog.getByRole('textbox', { name: 'Seat number' }).fill('b-12')
    await dialog.getByRole('button', { name: 'Add seat' }).click()
    await expect(dialog).toContainText('Floor -1 already has seat b-12')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  })

  await test.step('the employee can pick the new building', async () => {
    expect(await employeeBuildings()).toContain(annex)
  })

  const annexId = Number(sql(`SELECT building_id FROM buildings WHERE building_name = '${annex}'`))
  const ticket = await createTicketViaApi(request, employee, { title: `Annex door ${stamp}`, building_id: annexId })

  await test.step('once a ticket is there, delete is refused and it is deactivated instead', async () => {
    await page.reload()
    await page.getByRole('list', { name: 'Buildings' }).getByRole('button', { name: new RegExp(`^${annex}`) }).click()
    await expect(details).toContainText('1 active ticket')

    await details.getByRole('button', { name: `Delete ${annex}` }).click()
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(dialog.getByRole('alert')).toContainText(`${annex} has 1 ticket, so it can't be deleted. Deactivate it instead.`)
    await dialog.getByRole('button', { name: 'Deactivate instead' }).click()

    await expect(dialog).toHaveAccessibleName(`Deactivate ${annex}?`)
    await expect(dialog).toContainText('Its active ticket keeps this location.')
    await dialog.getByRole('button', { name: 'Deactivate' }).click()
    await expect(page.getByText(`${annex} is inactive. Employees can't pick it for new tickets.`)).toBeVisible()
    await expect(details.getByText('Inactive', { exact: true })).toBeVisible()
    await expect(details.getByRole('button', { name: `Reactivate ${annex}` })).toBeVisible()
  })

  await test.step("the employee can't pick it any more, but their ticket keeps it", async () => {
    expect(await employeeBuildings()).not.toContain(annex)
    await employeePage.goto(`/tickets/${ticket.ticket_id}`)
    await expect(employeePage.getByRole('main')).toContainText(annex)
    await employeePage.context().close()
  })

  await test.step("the building's ticket count opens its tickets on the dashboard", async () => {
    await details.getByRole('link', { name: '1 active ticket' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin\\?building=${annexId}$`))
    await expect(page.getByRole('table', { name: 'All tickets' }).getByRole('row').getByRole('link')).toHaveText([ticket.title])
    await expect(page.getByRole('combobox', { name: /^Building/ })).toHaveText(`${annex} (inactive)`)
  })
})

test('employees cannot open the admin pages', async ({ page, request }) => {
  const { lights } = await seedTickets(request)
  const employee = await registerViaApi(request, { name: 'Curious Employee' })

  await signIn(page, employee.email)
  for (const path of ['/admin', `/admin/tickets/${lights.ticket_id}`, '/admin/people', '/admin/facilities']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: "You don't have access to this" })).toBeVisible()
    await expect(page.getByText(lights.title)).toHaveCount(0)
  }
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('the admin dashboard, ticket details, People and Facilities fit the screen', async ({ page, request }) => {
    const { stamp, lights } = await seedTickets(request)
    const admin = await registerAdmin(request)

    await signIn(page, admin.email, { home: ADMIN_HOME })
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(page.getByRole('table')).toHaveCount(0)
    // On phones the list is cards; each card is one link to the ticket.
    const card = page
      .getByRole('region', { name: 'All tickets' })
      .getByRole('link')
      .filter({ hasText: `#${lights.ticket_id} ${lights.title}` })
    await expect(card).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    await card.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${lights.ticket_id} ${lights.title}`)
    await expect(page.getByRole('list', { name: 'Ticket workflow' })).toHaveCSS('flex-direction', 'column')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    // The page links sit in the menu drawer on phones.
    await goViaMenu(page, 'People')
    await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByRole('listitem').filter({ hasText: admin.email })).toContainText('Facility Admin')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    // Facilities: a building dropdown instead of the list, and the floors below it.
    await goViaMenu(page, 'Facilities')
    await expect(page.getByRole('heading', { level: 1, name: 'Facilities' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Buildings' })).toHaveCount(0)
    await choose(page, 'Building', 'Building B')
    const building = page.getByRole('region', { name: 'Building B' })
    await building.getByRole('button', { name: /^Floor 2,/ }).click()
    await expect(building.getByRole('group', { name: 'Seats on Floor 2' }).getByRole('button', { name: 'Seat 201' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import {
  addNote,
  getMyTicket,
  listMyTickets,
  listNotes,
  listStatusHistory,
  requestEscalation,
} from '../services/ticketService'
import { makeTicket, TICKETS } from '../test/fixtures'
import { JANE, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/ticketService', () => ({
  getMyTicket: vi.fn(),
  listNotes: vi.fn(),
  listStatusHistory: vi.fn(),
  addNote: vi.fn(),
  requestEscalation: vi.fn(),
  listMyTickets: vi.fn(),
}))

const TICKET = makeTicket({
  ticket_id: 5,
  title: 'Printer jam',
  description: 'Every job jams.\nTried restarting.',
  category: 'printer',
  status: 'in_progress',
  affected_scope: 'floor',
  floor_number: 2,
  seat_number: null,
  assigned_to_user_id: 4,
  assigned_to_name: 'Sam Tech',
  acknowledged_at: '2026-09-22T11:00:00-04:00',
  assigned_at: '2026-09-22T11:05:00-04:00',
  resolved_at: null,
  blocked_reason: null,
  escalation_reason: null,
})

const NOTES = [
  { note_id: 1, ticket_id: 5, user_id: 4, author_name: 'Sam Tech', author_role: 'engineer', note_text: 'Ordering a roller.', created_at: '2026-09-22T11:10:00-04:00' },
  { note_id: 2, ticket_id: 5, user_id: JANE.user_id, author_name: 'Jane Doe', author_role: 'employee', note_text: 'Thanks!', created_at: '2026-09-22T11:20:00-04:00' },
]

const change = (history_id, from_status, to_status, extra = {}) => ({
  history_id,
  ticket_id: 5,
  from_status,
  to_status,
  changed_by_user_id: 4,
  changed_by_name: 'Sam Tech',
  changed_by_role: 'engineer',
  reason: null,
  changed_at: `2026-09-22T1${history_id}:00:00-04:00`,
  ...extra,
})

const OPENED = change(1, null, 'open', { changed_by_user_id: JANE.user_id, changed_by_name: 'Jane Doe', changed_by_role: 'employee' })

// Open -> In progress -> Blocked -> In progress -> Resolved -> reopened.
const HISTORY = [
  OPENED,
  change(2, 'open', 'in_progress'),
  change(3, 'in_progress', 'blocked', { reason: 'Waiting on a roller' }),
  change(4, 'blocked', 'in_progress'),
  change(5, 'in_progress', 'resolved'),
  change(6, 'resolved', 'open', { changed_by_user_id: 9, changed_by_name: 'Ada Admin', changed_by_role: 'admin', reason: 'Jammed again the next day' }),
]

function renderPage(route = '/tickets/5', width = 1280) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route, user: JANE, width })
  return user
}

const panel = (name) => screen.getByRole('region', { name })
const heading = () => screen.findByRole('heading', { level: 1, name: 'Printer jam' })
const thread = () => panel('Updates & notes')
const threadItems = () => within(thread()).findAllByRole('listitem')
const facts = () =>
  Object.fromEntries(within(panel('Details')).getAllByRole('term').map((dt) => [dt.textContent, dt.nextSibling.textContent]))

beforeEach(() => {
  vi.mocked(getMyTicket).mockReset().mockResolvedValue(TICKET)
  vi.mocked(listNotes).mockReset().mockResolvedValue(NOTES)
  vi.mocked(listStatusHistory).mockReset().mockResolvedValue([OPENED])
  vi.mocked(addNote).mockReset()
  vi.mocked(requestEscalation).mockReset()
  vi.mocked(listMyTickets).mockReset().mockResolvedValue(TICKETS)
})

describe('TicketDetailsPage: loading and errors', () => {
  it('shows a placeholder while loading', () => {
    vi.mocked(getMyTicket).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Loading ticket')).toHaveAttribute('aria-busy', 'true')
  })

  it.each(['/tickets/abc', '/tickets/0', '/tickets/99999999999'])(
    'treats %s as not found without calling the API',
    (route) => {
      renderPage(route)
      expect(screen.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
      expect(getMyTicket).not.toHaveBeenCalled()
    },
  )

  it("shows someone else's (or a missing) ticket as not found", async () => {
    vi.mocked(getMyTicket).mockRejectedValue(new ApiError('Ticket not found', { status: 404 }))
    renderPage('/tickets/77')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('explains other failures and retries', async () => {
    vi.mocked(getMyTicket)
      .mockRejectedValueOnce(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
      .mockResolvedValue(TICKET)
    const user = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await heading()).toBeInTheDocument()
  })
})

describe('TicketDetailsPage: the ticket', () => {
  it('opens from the dashboard list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    const table = await screen.findByRole('table', { name: 'My tickets' })

    await user.click(within(table).getByRole('link', { name: 'Printer jam' }))

    expect(await heading()).toBeInTheDocument()
    expect(getMyTicket).toHaveBeenCalledWith({ ticketId: '5' }, expect.anything())
  })

  it('shows a breadcrumb back to the dashboard', async () => {
    renderPage()
    await heading()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(within(crumbs).getByText('#5')).toHaveAttribute('aria-current', 'page')
  })

  it('shows what was reported: reference, title, description and status', async () => {
    renderPage()
    await heading()
    expect(screen.getByText(/^#5 · Printer \/ Peripheral · reported /)).toBeInTheDocument()
    expect(screen.getByText(/Every job jams\.\s+Tried restarting\./)).toBeInTheDocument()
    expect(screen.getByText('In Progress', { selector: 'span' })).toBeInTheDocument()
  })

  it('shows progress with when each step was reached', async () => {
    vi.mocked(listStatusHistory).mockResolvedValue(HISTORY.slice(0, 2))
    renderPage()
    await heading()
    const steps = within(screen.getByRole('list', { name: 'Ticket progress' })).getAllByRole('listitem')
    await waitFor(() => expect(steps[1]).toHaveTextContent('Sep 22, 12:00 PM'))
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
    expect(steps[1]).toHaveTextContent('In Progress (current status)')
    expect(steps[0]).toHaveTextContent('Sep 22, 11:00 AM')
  })

  it('shows the details, without urgency or priority', async () => {
    renderPage()
    await heading()
    expect(facts()).toEqual({
      Affects: 'My floor',
      Location: 'Building A · Floor 2',
      Category: 'Printer / Peripheral',
      Engineer: 'STSam Tech',
      Acknowledged: '1 h after you reported it',
      'Last updated': expect.any(String),
    })
    expect(document.body).not.toHaveTextContent(/priority|urgency|\bP[123]\b/i)
  })

  it('says when no engineer is assigned yet', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'open', assigned_to_name: null, acknowledged_at: null, assigned_at: null })
    renderPage()
    await heading()
    expect(facts()).toMatchObject({ Engineer: 'Not assigned yet', Acknowledged: 'Not yet' })
    expect(screen.getByRole('textbox', { name: 'Add a note' })).toHaveAttribute(
      'placeholder',
      'Add details or tell the team what changed…',
    )
  })

  it('shows the blocked reason under In Progress', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'blocked', blocked_reason: 'Waiting on parts' })
    renderPage()
    await heading()
    const steps = within(screen.getByRole('list', { name: 'Ticket progress' })).getAllByRole('listitem')
    expect(steps[1]).toHaveTextContent('Blocked: Waiting on parts')
  })

  it('confirms a ticket that was just created', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: { pathname: '/tickets/5', state: { createdTicket: true } }, user: JANE })
    await heading()

    expect(screen.getByRole('alert')).toHaveTextContent('Ticket created.')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(/Ticket created/)).not.toBeInTheDocument()
  })

  it('puts Details and Escalation beside the thread on desktop', async () => {
    renderPage('/tickets/5', 1280)
    await heading()
    const [main, side] = [thread().parentElement, panel('Details').parentElement]
    expect(main).not.toBe(side)
    expect(side).toContainElement(panel('Escalation'))
  })

  it.each([820, 375])('stacks header, details, thread and escalation at %ipx', async (width) => {
    renderPage('/tickets/5', width)
    await heading()
    const order = [panel('Details'), thread(), panel('Escalation')]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('shows progress top to bottom on a phone', async () => {
    renderPage('/tickets/5', 375)
    await heading()
    expect(screen.getByRole('list', { name: 'Ticket progress' })).toHaveStyle({ flexDirection: 'column' })
  })
})

describe('TicketDetailsPage: updates and notes', () => {
  it('merges status changes, the assignment and notes, oldest first', async () => {
    vi.mocked(listStatusHistory).mockResolvedValue(HISTORY.slice(0, 2))
    renderPage()
    await heading()
    const items = await threadItems()

    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^OpenedYou · Employee · Sep 22, 11:00 AM$/),
      expect.stringMatching(/^Assigned to Sam TechSep 22, 11:05 AM$/),
      expect.stringMatching(/^STSam Tech · Engineer · Sep 22, 11:10 AMOrdering a roller\.$/),
      expect.stringMatching(/^JDYou · Employee · Sep 22, 11:20 AMThanks!$/),
      expect.stringMatching(/^In ProgressSam Tech · Engineer · Sep 22, 12:00 PM$/),
    ])
    expect(within(thread()).getByText('Visible to you, the engineer and Facility Admins')).toBeInTheDocument()
    expect(listStatusHistory).toHaveBeenCalledWith({ ticketId: '5' }, expect.anything())
  })

  it('shows every status step with who made it and why', async () => {
    vi.mocked(listStatusHistory).mockResolvedValue(HISTORY)
    vi.mocked(listNotes).mockResolvedValue([])
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, assigned_at: null })
    renderPage()
    await heading()
    const items = await threadItems()

    expect(items.map((li) => li.firstChild.nextSibling.firstChild.firstChild.textContent)).toEqual([
      'Opened',
      'In Progress',
      'Blocked',
      'Unblocked → In Progress',
      'Resolved',
      'Reopened → Open',
    ])
    expect(items[2]).toHaveTextContent(/Waiting on a roller$/)
    expect(items[5]).toHaveTextContent(/^Reopened → OpenAda Admin · Facility admin · .+Jammed again the next day$/)
  })

  it('shows a placeholder while updates load', async () => {
    vi.mocked(listNotes).mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    await heading()
    expect(within(thread()).getByLabelText('Loading updates')).toBeInTheDocument()
  })

  it('says when there is nothing yet', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    vi.mocked(listStatusHistory).mockResolvedValue([])
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, assigned_at: null })
    renderPage()
    await heading()
    expect(await within(thread()).findByText('No updates yet.')).toBeInTheDocument()
  })

  it.each([
    ['notes', listNotes],
    ['history', listStatusHistory],
  ])('explains a failed %s load and retries', async (_name, loader) => {
    vi.mocked(loader).mockRejectedValueOnce(new ApiError("Can't reach the server.", { status: 0 }))
    const user = renderPage()
    await heading()

    await user.click(await within(thread()).findByRole('button', { name: 'Try again' }))
    expect(await within(thread()).findByText('Ordering a roller.')).toBeInTheDocument()
  })

  it('keeps long notes whole', async () => {
    const long = 'The printer '.repeat(80).trim()
    vi.mocked(listNotes).mockResolvedValue([{ ...NOTES[0], note_text: long }])
    renderPage()
    await heading()
    expect(await within(thread()).findByText(long)).toBeInTheDocument()
  })

  it('adds a note, then refreshes the ticket and notes', async () => {
    vi.mocked(addNote).mockResolvedValue({ note_id: 3 })
    const user = renderPage()
    await heading()
    const box = within(thread()).getByRole('textbox', { name: 'Add a note' })
    expect(box).toHaveAttribute('placeholder', 'Add a note for Sam…')

    await user.type(box, 'It jammed again.')
    expect(within(thread()).getByText('16/2000')).toBeInTheDocument()
    await user.click(within(thread()).getByRole('button', { name: 'Add note' }))

    expect(addNote).toHaveBeenCalledWith(5, 'It jammed again.')
    await waitFor(() => expect(box).toHaveValue(''))
    await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(2))
    expect(getMyTicket).toHaveBeenCalledTimes(2)
  })

  it('refuses an empty note and clears the message on typing', async () => {
    const user = renderPage()
    await heading()
    const notes = within(thread())

    await user.click(notes.getByRole('button', { name: 'Add note' }))
    expect(notes.getByText('Write a note first.')).toBeInTheDocument()
    expect(addNote).not.toHaveBeenCalled()

    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'x')
    expect(notes.queryByText('Write a note first.')).not.toBeInTheDocument()
  })

  it('refuses a note that is too long', async () => {
    const user = renderPage()
    await heading()
    const notes = within(thread())
    await user.click(notes.getByRole('textbox', { name: 'Add a note' }))
    await user.paste('x'.repeat(2001))

    await user.click(notes.getByRole('button', { name: 'Add note' }))

    expect(notes.getByText('Use 2000 characters or fewer.')).toBeInTheDocument()
  })

  it('disables the note box while sending', async () => {
    vi.mocked(addNote).mockReturnValue(new Promise(() => {}))
    const user = renderPage()
    await heading()
    const notes = within(thread())
    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'hi')

    await user.click(notes.getByRole('button', { name: 'Add note' }))

    expect(notes.getByRole('button', { name: 'Adding note…' })).toBeDisabled()
    expect(notes.getByRole('textbox', { name: 'Add a note' })).toBeDisabled()
  })

  it.each([
    ['API error', new ApiError("Closed tickets can't take new notes", { status: 409 }), "Closed tickets can't take new notes"],
    ['unexpected error', new TypeError('boom'), 'Something went wrong. Please try again.'],
  ])('shows an %s under the note box and keeps the text', async (_label, error, message) => {
    vi.mocked(addNote).mockRejectedValue(error)
    const user = renderPage()
    await heading()
    const notes = within(thread())
    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'hello')

    await user.click(notes.getByRole('button', { name: 'Add note' }))

    expect(await notes.findByText(message)).toBeInTheDocument()
    expect(notes.getByRole('textbox', { name: 'Add a note' })).toHaveValue('hello')
  })
})

describe('TicketDetailsPage: escalation', () => {
  const escalation = () => within(panel('Escalation'))

  it('asks for a reason right on the page, sends it, then refreshes', async () => {
    vi.mocked(requestEscalation).mockResolvedValue({})
    const user = renderPage()
    await heading()

    await user.click(escalation().getByRole('button', { name: 'Send escalation request' }))
    expect(escalation().getByText('Tell the Facility Admin why this needs more attention.')).toBeInTheDocument()
    expect(requestEscalation).not.toHaveBeenCalled()

    await user.type(escalation().getByRole('textbox', { name: /^Reason/ }), 'Payroll is due today.')
    await user.click(escalation().getByRole('button', { name: 'Send escalation request' }))

    expect(requestEscalation).toHaveBeenCalledWith(5, 'Payroll is due today.')
    await waitFor(() => expect(getMyTicket).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says review, never priority', async () => {
    renderPage()
    await heading()
    expect(panel('Escalation')).toHaveTextContent('ask a Facility Admin to review it')
    expect(panel('Escalation')).not.toHaveTextContent(/priority/i)
  })

  it('limits the reason length', async () => {
    const user = renderPage()
    await heading()
    await user.click(escalation().getByRole('textbox', { name: /^Reason/ }))
    await user.paste('x'.repeat(1001))

    await user.click(escalation().getByRole('button', { name: 'Send escalation request' }))
    expect(escalation().getByText('Use 1000 characters or fewer.')).toBeInTheDocument()

    await user.type(escalation().getByRole('textbox', { name: /^Reason/ }), 'y')
    expect(escalation().queryByText('Use 1000 characters or fewer.')).not.toBeInTheDocument()
    expect(requestEscalation).not.toHaveBeenCalled()
  })

  it('disables the form while sending', async () => {
    vi.mocked(requestEscalation).mockReturnValue(new Promise(() => {}))
    const user = renderPage()
    await heading()
    await user.type(escalation().getByRole('textbox', { name: /^Reason/ }), 'Urgent')

    await user.click(escalation().getByRole('button', { name: 'Send escalation request' }))

    expect(escalation().getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(escalation().getByRole('textbox', { name: /^Reason/ })).toBeDisabled()
  })

  it.each([
    ['API error', new ApiError('Escalation has already been requested for this ticket', { status: 409 }), 'Escalation has already been requested for this ticket'],
    ['unexpected error', new TypeError('boom'), 'Something went wrong. Please try again.'],
  ])('shows an %s under the reason', async (_label, error, message) => {
    vi.mocked(requestEscalation).mockRejectedValue(error)
    const user = renderPage()
    await heading()
    await user.type(escalation().getByRole('textbox', { name: /^Reason/ }), 'Urgent')

    await user.click(escalation().getByRole('button', { name: 'Send escalation request' }))

    expect(await escalation().findByText(message)).toBeInTheDocument()
    expect(escalation().getByRole('textbox', { name: /^Reason/ })).toHaveValue('Urgent')
  })

  it('shows an escalation already requested, with the reason', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, escalation_requested: true, escalation_reason: 'Payroll is due today.' })
    renderPage()
    await heading()
    expect(escalation().getByRole('heading', { name: 'Escalation requested' })).toBeInTheDocument()
    expect(escalation().getByText('Your reason: Payroll is due today.')).toBeInTheDocument()
    expect(escalation().queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('TicketDetailsPage: closed tickets', () => {
  it('shows the updates but no note box or escalation form', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed', resolved_at: '2026-09-22T15:00:00-04:00' })
    renderPage()
    await heading()

    expect(within(thread()).getByText("This ticket is closed, so new notes can't be added.")).toBeInTheDocument()
    expect(within(thread()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel('Escalation')).getByText("Closed tickets can't be escalated.")).toBeInTheDocument()
    expect(facts()).toHaveProperty('Resolved', 'Sep 22, 3:00 PM')
    expect(await within(thread()).findByText('Ordering a roller.')).toBeInTheDocument()
  })

  it('still shows an escalation made before closing', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed', escalation_requested: true, escalation_reason: 'x' })
    renderPage()
    await heading()
    expect(within(panel('Escalation')).getByRole('heading', { name: 'Escalation requested' })).toBeInTheDocument()
  })
})

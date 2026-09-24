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
const heading = () => screen.findByRole('heading', { level: 1, name: '#5 Printer jam' })

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

  it('shows the header, workflow and details', async () => {
    renderPage()
    await heading()

    const workflow = within(panel('Progress')).getByRole('list', { name: 'Ticket workflow' })
    expect(within(workflow).getAllByRole('listitem').find((li) => li.getAttribute('aria-current'))).toHaveTextContent(
      'In Progress (current status)',
    )

    const details = panel('Details')
    expect(within(details).getByText(/Every job jams\.\s+Tried restarting\./)).toBeInTheDocument()
    const facts = Object.fromEntries(
      within(details).getAllByRole('term').map((dt) => [dt.textContent, dt.nextSibling.textContent]),
    )
    expect(facts).toMatchObject({
      Category: 'Printer / Peripheral',
      Location: 'Building A · Floor 2',
      Impact: 'My floor',
      'Assigned engineer': 'Sam Tech',
    })
    expect(facts).toHaveProperty('Acknowledged')
    expect(facts).toHaveProperty('Assigned')
    expect(facts).not.toHaveProperty('Resolved')
    expect(facts).not.toHaveProperty('Priority')
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
    expect(screen.getByText('Impact: My floor')).toBeInTheDocument()
  })

  it('says when no engineer is assigned yet', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'open', assigned_to_name: null, acknowledged_at: null, assigned_at: null })
    renderPage()
    await heading()
    expect(within(panel('Details')).getByText('Not assigned yet')).toBeInTheDocument()
  })

  it('shows the blocked reason in the workflow', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'blocked', blocked_reason: 'Waiting on parts' })
    renderPage()
    await heading()
    expect(within(panel('Progress')).getByText(/^Blocked: Waiting on parts/)).toBeInTheDocument()
  })

  it('confirms a ticket that was just created', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: { pathname: '/tickets/5', state: { createdTicket: true } }, user: JANE })
    await heading()

    expect(screen.getByRole('alert')).toHaveTextContent('Ticket created.')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(/Ticket created/)).not.toBeInTheDocument()
  })

  it('works on a phone', async () => {
    renderPage('/tickets/5', 375)
    await heading()
    expect(screen.getByRole('list', { name: 'Ticket workflow' })).toHaveStyle({ flexDirection: 'column' })
  })
})

describe('TicketDetailsPage: status history', () => {
  const rows = async () => within(panel('Status history')).findAllByRole('listitem')

  it('shows a new ticket as opened by you', async () => {
    renderPage()
    await heading()
    const items = await rows()
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent(/^OpenedYou · Employee · .+$/)
    expect(listStatusHistory).toHaveBeenCalledWith({ ticketId: '5' }, expect.anything())
  })

  it('lists every step oldest first, with who made it and why', async () => {
    vi.mocked(listStatusHistory).mockResolvedValue(HISTORY)
    renderPage()
    await heading()
    const items = await rows()

    expect(items.map((li) => li.firstChild.textContent)).toEqual([
      'Opened',
      'In Progress',
      'Blocked',
      'Unblocked → In Progress',
      'Resolved',
      'Reopened → Open',
    ])
    expect(items[1]).toHaveTextContent(/^In ProgressSam Tech · Engineer · /)
    expect(items[2]).toHaveTextContent(/Waiting on a roller$/)
    expect(items[5]).toHaveTextContent(/^Reopened → OpenAda Admin · Facility admin · .+Jammed again the next day$/)
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
  })

  it('shows a placeholder while the history loads', async () => {
    vi.mocked(listStatusHistory).mockReturnValue(new Promise(() => {}))
    renderPage()
    await heading()
    expect(within(panel('Status history')).getByLabelText('Loading status history')).toBeInTheDocument()
  })

  it('says when there is no history', async () => {
    vi.mocked(listStatusHistory).mockResolvedValue([])
    renderPage()
    await heading()
    expect(await within(panel('Status history')).findByText('No status changes yet.')).toBeInTheDocument()
  })

  it('explains a failed history load and retries', async () => {
    vi.mocked(listStatusHistory)
      .mockRejectedValueOnce(new ApiError("Can't reach the server.", { status: 0 }))
      .mockResolvedValue(HISTORY)
    const user = renderPage()
    await heading()

    const history = within(panel('Status history'))
    await user.click(await history.findByRole('button', { name: 'Try again' }))
    expect(await history.findByText('Reopened → Open')).toBeInTheDocument()
  })

  it('works on a phone', async () => {
    vi.mocked(listStatusHistory).mockResolvedValue(HISTORY)
    renderPage('/tickets/5', 375)
    await heading()
    expect(await rows()).toHaveLength(6)
  })
})

describe('TicketDetailsPage: notes', () => {
  it('lists notes oldest first, naming the engineer and "You"', async () => {
    renderPage()
    await heading()
    const notes = within(panel('Notes'))
    const items = await notes.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent(/^Sam Tech · Engineer · .+Ordering a roller\.$/)
    expect(items[1]).toHaveTextContent(/^You · Employee · .+Thanks!$/)
  })

  it('shows a placeholder while notes load', async () => {
    vi.mocked(listNotes)
      .mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    await heading()
    expect(within(panel('Notes')).getByLabelText('Loading notes')).toBeInTheDocument()
  })

  it('says when there are no notes', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    renderPage()
    expect(await within(await screen.findByRole('region', { name: 'Notes' })).findByText('No notes yet.')).toBeInTheDocument()
  })

  it('explains a failed notes load and retries', async () => {
    vi.mocked(listNotes).mockRejectedValueOnce(new ApiError("Can't reach the server.", { status: 0 })).mockResolvedValue(NOTES)
    const user = renderPage()
    await heading()

    const notes = within(panel('Notes'))
    await user.click(await notes.findByRole('button', { name: 'Try again' }))
    expect(await notes.findByText('Ordering a roller.')).toBeInTheDocument()
  })

  it('adds a note, then refreshes the ticket and notes', async () => {
    vi.mocked(addNote).mockResolvedValue({ note_id: 3 })
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))
    const box = notes.getByRole('textbox', { name: 'Add a note' })

    await user.type(box, 'It jammed again.')
    expect(notes.getByText('16/2000')).toBeInTheDocument()
    await user.click(notes.getByRole('button', { name: 'Add note' }))

    expect(addNote).toHaveBeenCalledWith(5, 'It jammed again.')
    await waitFor(() => expect(box).toHaveValue(''))
    await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(2))
    expect(getMyTicket).toHaveBeenCalledTimes(2)
  })

  it('refuses an empty note and clears the message on typing', async () => {
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))

    await user.click(notes.getByRole('button', { name: 'Add note' }))
    expect(notes.getByText('Write a note first.')).toBeInTheDocument()
    expect(addNote).not.toHaveBeenCalled()

    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'x')
    expect(notes.queryByText('Write a note first.')).not.toBeInTheDocument()
  })

  it('refuses a note that is too long', async () => {
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))
    const box = notes.getByRole('textbox', { name: 'Add a note' })
    await user.click(box)
    await user.paste('x'.repeat(2001))

    await user.click(notes.getByRole('button', { name: 'Add note' }))

    expect(notes.getByText('Use 2000 characters or fewer.')).toBeInTheDocument()
  })

  it('disables the note box while sending', async () => {
    vi.mocked(addNote).mockReturnValue(new Promise(() => {}))
    const user = renderPage()
    await heading()
    const notes = within(panel('Notes'))
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
    const notes = within(panel('Notes'))
    await user.type(notes.getByRole('textbox', { name: 'Add a note' }), 'hello')

    await user.click(notes.getByRole('button', { name: 'Add note' }))

    expect(await notes.findByText(message)).toBeInTheDocument()
    expect(notes.getByRole('textbox', { name: 'Add a note' })).toHaveValue('hello')
  })
})

describe('TicketDetailsPage: escalation', () => {
  it('asks for a reason, sends it, then refreshes', async () => {
    vi.mocked(requestEscalation).mockResolvedValue({})
    const user = renderPage()
    await heading()

    await user.click(within(panel('Escalation')).getByRole('button', { name: 'Request escalation' }))
    const dialog = screen.getByRole('dialog', { name: 'Request escalation' })
    await user.click(within(dialog).getByRole('button', { name: 'Request escalation' }))
    expect(within(dialog).getByText('Tell the facility admin why this needs more attention.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox'), 'Payroll is due today.')
    await user.click(within(dialog).getByRole('button', { name: 'Request escalation' }))

    expect(requestEscalation).toHaveBeenCalledWith(5, 'Payroll is due today.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(getMyTicket).toHaveBeenCalledTimes(2)
  })

  it('limits the reason length and can be cancelled', async () => {
    const user = renderPage()
    await heading()
    await user.click(within(panel('Escalation')).getByRole('button', { name: 'Request escalation' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('textbox'))
    await user.paste('x'.repeat(1001))

    await user.click(within(dialog).getByRole('button', { name: 'Request escalation' }))
    expect(within(dialog).getByText('Use 1000 characters or fewer.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox'), 'y')
    expect(within(dialog).queryByText('Use 1000 characters or fewer.')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requestEscalation).not.toHaveBeenCalled()
  })

  it('disables the dialog while sending', async () => {
    vi.mocked(requestEscalation).mockReturnValue(new Promise(() => {}))
    const user = renderPage()
    await heading()
    await user.click(within(panel('Escalation')).getByRole('button', { name: 'Request escalation' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'Urgent')

    await user.click(within(dialog).getByRole('button', { name: 'Request escalation' }))

    expect(within(dialog).getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it.each([
    ['API error', new ApiError('Escalation has already been requested for this ticket', { status: 409 }), 'Escalation has already been requested for this ticket'],
    ['unexpected error', new TypeError('boom'), 'Something went wrong. Please try again.'],
  ])('shows an %s in the dialog', async (_label, error, message) => {
    vi.mocked(requestEscalation).mockRejectedValue(error)
    const user = renderPage()
    await heading()
    await user.click(within(panel('Escalation')).getByRole('button', { name: 'Request escalation' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'Urgent')

    await user.click(within(dialog).getByRole('button', { name: 'Request escalation' }))

    expect(await within(dialog).findByText(message)).toBeInTheDocument()
  })

  it('shows an escalation already requested, with the reason', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, escalation_requested: true, escalation_reason: 'Payroll is due today.' })
    renderPage()
    await heading()
    const escalation = within(panel('Escalation'))
    expect(escalation.getByText('Escalation requested.')).toBeInTheDocument()
    expect(escalation.getByText('Your reason: Payroll is due today.')).toBeInTheDocument()
    expect(escalation.queryByRole('button', { name: 'Request escalation' })).not.toBeInTheDocument()
  })
})

describe('TicketDetailsPage: closed tickets', () => {
  it('shows history but no note box or escalation', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed', resolved_at: '2026-09-22T15:00:00-04:00' })
    renderPage()
    await heading()

    expect(within(panel('Notes')).getByText("This ticket is closed, so new notes can't be added.")).toBeInTheDocument()
    expect(within(panel('Notes')).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel('Escalation')).getByText("Closed tickets can't be escalated.")).toBeInTheDocument()
    expect(within(panel('Details')).getByText('Resolved')).toBeInTheDocument()
    expect(await within(panel('Notes')).findByText('Ordering a roller.')).toBeInTheDocument()
  })

  it('still shows an escalation made before closing', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...TICKET, status: 'closed', escalation_requested: true, escalation_reason: 'x' })
    renderPage()
    await heading()
    expect(within(panel('Escalation')).getByText('Escalation requested.')).toBeInTheDocument()
  })
})

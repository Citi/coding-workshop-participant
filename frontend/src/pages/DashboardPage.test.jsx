import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { getMyTicket, listMyTickets, listNotes, listStatusHistory } from '../services/ticketService'
import { makeTicket, TICKETS } from '../test/fixtures'
import { JANE, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/ticketService', () => ({
  listMyTickets: vi.fn(),
  getMyTicket: vi.fn(),
  listStatusHistory: vi.fn(),
  listNotes: vi.fn(),
}))

/** Serve TICKETS like the API would for the given filters. */
function fakeApi(filters = {}, tickets = TICKETS) {
  let result = tickets
  if (filters.view === 'active') result = result.filter((t) => t.status !== 'closed')
  if (filters.view === 'closed') result = result.filter((t) => t.status === 'closed')
  if (filters.status) result = result.filter((t) => t.status === filters.status)
  if (filters.q) result = result.filter((t) => t.title.toLowerCase().includes(filters.q.toLowerCase()))
  return Promise.resolve(result)
}

// The active ticket (#5, in progress) as GET /tickets/5 returns it, with its history and notes.
const DETAIL = { ...TICKETS[0], assigned_to_name: 'Sam Tech', blocked_reason: null }
const HISTORY = [
  { history_id: 1, ticket_id: 5, from_status: null, to_status: 'open', changed_at: '2026-09-22T09:00:00-04:00' },
  { history_id: 2, ticket_id: 5, from_status: 'open', to_status: 'in_progress', changed_at: '2026-09-22T10:30:00-04:00' },
]
const note = (id, name, role, text, at) => ({
  note_id: id, ticket_id: 5, user_id: id, author_name: name, author_role: role, note_text: text, created_at: at,
})
const NOTES = [
  note(1, 'Sam Tech', 'engineer', 'Ordering a new roller for tray 2.', '2026-09-22T11:00:00-04:00'),
  // Newer, but the employee's own note: the card shows the team's latest message.
  note(2, 'Jane Doe', 'employee', 'Thanks!', '2026-09-22T11:30:00-04:00'),
]

function renderDashboard({ width = 1280 } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/dashboard', user: JANE, width })
  return user
}

const table = () => screen.getByRole('table', { name: 'My tickets' })
const rowTitles = () =>
  within(table()).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[1].textContent)
const lastFilters = () => vi.mocked(listMyTickets).mock.calls.at(-1)[0]
const chip = (name) => screen.getByRole('button', { name: new RegExp(`^${name} \\d+$`) })
const activeCard = () => screen.findByRole('region', { name: 'Printer jam' })

beforeEach(() => {
  vi.mocked(listMyTickets).mockReset().mockImplementation((filters) => fakeApi(filters))
  vi.mocked(getMyTicket).mockReset().mockResolvedValue(DETAIL)
  vi.mocked(listStatusHistory).mockReset().mockResolvedValue(HISTORY)
  vi.mocked(listNotes).mockReset().mockResolvedValue(NOTES)
})

describe('DashboardPage: overview', () => {
  it('greets the user by time of day and links to the report form', async () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), Jane$/)
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Report an issue' })).toHaveAttribute('href', '/tickets/new')
    expect(await screen.findByText(/^3 active tickets · last update /)).toBeInTheDocument()
  })

  it('says "1 active ticket" in the singular', async () => {
    vi.mocked(listMyTickets).mockImplementation((filters) => fakeApi(filters, [TICKETS[0], TICKETS[1]]))
    renderDashboard()
    expect(await screen.findByText(/^1 active ticket · last update /)).toBeInTheDocument()
  })

  it('shows placeholders while the first load is in flight', () => {
    vi.mocked(listMyTickets).mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByLabelText('Loading your tickets')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the most recent active ticket with who is on it', async () => {
    renderDashboard()
    const card = await activeCard()
    expect(within(card).getByText('Your active ticket')).toBeInTheDocument()
    expect(within(card).getByText('#5')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Printer jam' })).toHaveAttribute('href', '/tickets/5')
    expect(within(card).getByText('In Progress', { selector: 'span' })).toBeInTheDocument()
    expect(await within(card).findByText('Building A · Floor 2 · Assigned to Sam Tech')).toBeInTheDocument()
    expect(getMyTicket).toHaveBeenCalledWith({ ticketId: 5 }, expect.anything())
  })

  it('shows progress with the time each step was reached', async () => {
    renderDashboard()
    const card = await activeCard()
    const steps = await within(card).findByRole('list', { name: 'Ticket progress' })
    const items = within(steps).getAllByRole('listitem')
    expect(items.map((li) => li.firstChild.nextSibling.firstChild.textContent)).toEqual([
      'Open (done)',
      'In Progress (current status)',
      'Resolved (not reached yet)',
      'Closed (not reached yet)',
    ])
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).toHaveTextContent('Sep 22, 9:00 AM')
    expect(items[1]).toHaveTextContent('Sep 22, 10:30 AM')
    expect(items[2]).not.toHaveTextContent(/AM|PM/)
  })

  it("shows the team's latest message, not the employee's own, with a reply link", async () => {
    renderDashboard()
    const message = await screen.findByTestId('latest-message')
    expect(message).toHaveTextContent('Sam Tech')
    expect(message).toHaveTextContent('Engineer')
    expect(message).toHaveTextContent('Ordering a new roller for tray 2.')
    expect(message).not.toHaveTextContent('Thanks!')
    expect(within(message).getByRole('link', { name: 'Reply' })).toHaveAttribute('href', '/tickets/5')
  })

  it('says when no engineer is assigned and nobody has written yet', async () => {
    vi.mocked(getMyTicket).mockResolvedValue({ ...DETAIL, assigned_to_name: null })
    vi.mocked(listNotes).mockResolvedValue([NOTES[1]])
    renderDashboard()
    const card = await activeCard()
    expect(await within(card).findByText('Building A · Floor 2 · Waiting for an engineer')).toBeInTheDocument()
    expect(within(card).getByText('No messages from the team yet. Their updates will show up here.')).toBeInTheDocument()
  })

  it('shows a blocked ticket paused on In Progress, with the reason', async () => {
    const blocked = makeTicket({ ticket_id: 8, title: 'AC too cold', status: 'blocked', updated_at: '2026-09-23T09:00:00Z' })
    vi.mocked(listMyTickets).mockImplementation((filters) => fakeApi(filters, [blocked]))
    vi.mocked(getMyTicket).mockResolvedValue({ ...blocked, assigned_to_name: 'Sam Tech', blocked_reason: 'Waiting on parts' })
    renderDashboard()
    const card = await screen.findByRole('region', { name: 'AC too cold' })
    const steps = await within(card).findByRole('list', { name: 'Ticket progress' })
    const inProgress = within(steps).getAllByRole('listitem')[1]
    expect(inProgress).toHaveAttribute('aria-current', 'step')
    expect(inProgress).toHaveTextContent('In Progress (paused while blocked)')
    expect(inProgress).toHaveTextContent('Blocked: Waiting on parts')
  })

  it('keeps the basics and offers a retry when the extra details fail', async () => {
    vi.mocked(listNotes)
      .mockRejectedValueOnce(new ApiError('Something went wrong on our side. Please try again.', { status: 500 }))
    const user = renderDashboard()
    const card = await activeCard()
    expect(await within(card).findByRole('alert')).toHaveTextContent("Couldn't load the latest updates.")
    expect(within(card).getByRole('link', { name: 'Printer jam' })).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('latest-message')).toHaveTextContent('Ordering a new roller')
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('never shows priority to an employee', async () => {
    renderDashboard()
    await screen.findByRole('table')
    await screen.findByTestId('latest-message')
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
  })

  it('says so when nothing is active', async () => {
    vi.mocked(listMyTickets).mockImplementation(() => Promise.resolve([TICKETS[1]]))
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'No active tickets' })).toBeInTheDocument()
    expect(screen.getByText(/^0 active tickets · last update /)).toBeInTheDocument()
    expect(getMyTicket).not.toHaveBeenCalled()
  })

  it('has a friendly empty state for a new employee', async () => {
    vi.mocked(listMyTickets).mockResolvedValue([])
    renderDashboard()
    expect(
      await screen.findByRole('heading', { name: "You haven't reported any issues yet" }),
    ).toBeInTheDocument()
    expect(screen.getByText('Report a problem with your desk, floor or building.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My tickets' })).not.toBeInTheDocument()
  })

  it('explains a failed load and retries', async () => {
    vi.mocked(listMyTickets)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
      .mockImplementation((filters) => fakeApi(filters))
    const user = renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
  })
})

describe('DashboardPage: my tickets list', () => {
  it('starts on active tickets, newest update first', async () => {
    renderDashboard()
    await screen.findByRole('table')
    expect(rowTitles()).toEqual(['Printer jam', 'Lobby doors', 'Wi-Fi keeps dropping'])
    expect(lastFilters()).toEqual({ view: 'active' })
    const firstRow = within(table()).getAllByRole('row')[1]
    expect(firstRow).toHaveTextContent('#5')
    expect(firstRow).toHaveTextContent('In Progress')
    expect(firstRow).toHaveTextContent('My floor')
    expect(firstRow).toHaveTextContent('Building A · Floor 2')
  })

  it('counts every chip from all of the employee\'s tickets', async () => {
    renderDashboard()
    await screen.findByRole('table')
    const chips = within(screen.getByRole('group', { name: 'Show tickets' })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual([
      'Active 3', 'Open 1', 'In Progress 1', 'Blocked 1', 'Resolved 0', 'Closed 1', 'All 4',
    ])
    expect(chip('Active')).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches between active, one status, closed and all', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.click(chip('Blocked'))
    await waitFor(() => expect(rowTitles()).toEqual(['Lobby doors']))
    expect(lastFilters()).toEqual({ status: 'blocked' })

    await user.click(chip('Closed'))
    await waitFor(() => expect(rowTitles()).toEqual(['Old lamp']))
    expect(lastFilters()).toEqual({ view: 'closed' })

    await user.click(chip('All'))
    await waitFor(() => expect(rowTitles()).toHaveLength(4))
    expect(lastFilters()).toEqual({})

    // Clicking the selected chip again keeps it selected.
    await user.click(chip('All'))
    expect(chip('All')).toHaveAttribute('aria-pressed', 'true')
  })

  it('has no urgency filter or column: tickets no longer have an urgency', async () => {
    renderDashboard()
    await screen.findByRole('table')
    expect(screen.queryByRole('combobox', { name: 'Urgency' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/urgency/i)
  })

  it('searches once typing pauses', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    const callsBefore = vi.mocked(listMyTickets).mock.calls.length

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'printer')

    // Generous timeout: under a full parallel run the 300 ms debounce can take a while to land.
    await waitFor(() => expect(rowTitles()).toEqual(['Printer jam']), { timeout: 3000 })
    // One search request for the whole word, not one per letter.
    expect(vi.mocked(listMyTickets).mock.calls.length - callsBefore).toBe(1)
    expect(lastFilters()).toEqual({ view: 'active', q: 'printer' })
  })

  it('offers to clear filters when nothing matches', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz')
    expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(3))
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
  })

  it('shows progress over the old rows while refreshing', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    vi.mocked(listMyTickets).mockReturnValue(new Promise(() => {}))

    await user.click(chip('Closed'))

    expect(await screen.findByRole('progressbar', { name: 'Updating tickets' })).toBeInTheDocument()
    expect(rowTitles()).toHaveLength(3)
  })

  it('shows a list error with retry, without losing the overview', async () => {
    const user = renderDashboard()
    await screen.findByRole('table')
    vi.mocked(listMyTickets).mockRejectedValueOnce(
      new ApiError('Something went wrong on our side. Please try again.', { status: 500 }),
    )

    await user.click(chip('Closed'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    expect(screen.getByRole('region', { name: 'Printer jam' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(rowTitles()).toEqual(['Old lamp']))
  })

  it('keeps long titles on one line in the table, with the full text on hover', async () => {
    const title = 'The printer on the third floor jams on every double-sided job since the firmware update'
    vi.mocked(listMyTickets).mockImplementation((filters) => fakeApi(filters, [makeTicket({ title })]))
    renderDashboard()
    await screen.findByRole('table')
    const cell = within(table()).getAllByRole('row')[1].querySelectorAll('td')[1]
    expect(cell).toHaveAttribute('title', title)
    expect(cell).toHaveTextContent(title)
    expect(within(table()).getAllByRole('row')[1].querySelectorAll('td')[2]).toHaveAttribute('title', 'Building A · Floor 3 · Seat 301')
  })

  it('pages long lists ten at a time', async () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      makeTicket({ ticket_id: 100 + i, title: `Ticket ${i + 1}`, updated_at: `2026-09-22T${String(i).padStart(2, '0')}:00:00Z` }),
    )
    vi.mocked(listMyTickets).mockImplementation((filters) => fakeApi(filters, many))
    const user = renderDashboard()
    await screen.findByRole('table')
    expect(rowTitles()).toHaveLength(10)
    expect(screen.getByText('1–10 of 23')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(rowTitles()).toEqual(['Ticket 21', 'Ticket 22', 'Ticket 23'])

    // A new filter starts back on page one.
    await user.click(chip('Open'))
    await waitFor(() => expect(screen.getByText('1–10 of 23')).toBeInTheDocument())
  })

  it('shows no pager for short lists', async () => {
    renderDashboard()
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Go to next page' })).not.toBeInTheDocument()
  })

  it('puts the location under the title on tablets', async () => {
    renderDashboard({ width: 820 })
    await screen.findByRole('table')
    const headers = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['#', 'Title and location', 'Status', 'Impact', 'Updated'])
    const titleCell = within(table()).getAllByRole('row')[1].querySelectorAll('td')[1]
    expect(titleCell).toHaveTextContent('Printer jamBuilding A · Floor 2')
  })

  it('shows every column on desktop', async () => {
    renderDashboard({ width: 1280 })
    await screen.findByRole('table')
    const headers = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['#', 'Title', 'Location', 'Status', 'Impact', 'Updated'])
  })

  it('uses cards instead of a table on phones', async () => {
    renderDashboard({ width: 375 })
    const section = await screen.findByRole('region', { name: 'My tickets' })
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(3))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(section).getAllByRole('listitem')[0]).toHaveTextContent('#5 Printer jam')
    expect(within(section).getAllByRole('link')[0]).toHaveAttribute('href', '/tickets/5')
  })
})

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { SESSION_ENDED } from './auth/AuthContext'
import { api } from './services/apiClient'
import { getSession } from './services/session'
import { listMyTickets } from './services/ticketService'
import { ALEX, JANE, renderWithProviders, SAM } from './test/renderWithProviders'

// The dashboards load tickets on arrival; these tests only care about routing and sign-in.
vi.mock('./services/ticketService', () => ({ listMyTickets: vi.fn().mockResolvedValue([]) }))
vi.mock('./services/adminTicketService', () => ({
  listAllTickets: vi.fn().mockResolvedValue([]),
  getMetrics: vi.fn().mockResolvedValue({ unassigned: 0, open: 0, in_progress: 0, blocked: 0, resolved: 0, active_p1: 0, escalated: 0, closed_last_7_days: 0 }),
}))
vi.mock('./services/locationService', () => ({
  listBuildings: vi.fn().mockResolvedValue([]),
  listFloors: vi.fn().mockResolvedValue([]),
  listSeats: vi.fn().mockResolvedValue([]),
}))
vi.mock('./services/adminFacilityService', () => ({ getFacilities: vi.fn().mockResolvedValue([]) }))
vi.mock('./services/adminUserService', () => ({
  listEngineers: vi.fn().mockResolvedValue([]),
  listUsers: vi.fn().mockResolvedValue([]),
}))
vi.mock('./services/engineerTicketService', () => ({
  listMyQueue: vi.fn().mockResolvedValue([]),
  getAssignedTicket: vi.fn(),
  listAssignedTicketHistory: vi.fn(),
  listAssignedTicketNotes: vi.fn(),
  addAssignedTicketNote: vi.fn(),
}))

const heading = () => screen.getByRole('heading', { level: 1 })

describe('routing for guests', () => {
  it.each([
    ['/', 'Sign in'],
    ['/login', 'Sign in'],
    ['/register', 'Create your account'],
    ['/no-such-page', 'Page not found'],
  ])('%s shows "%s"', (route, name) => {
    renderWithProviders(<App />, { route })
    expect(heading()).toHaveTextContent(name)
  })

  it('sends /dashboard to sign in, with a reason', () => {
    renderWithProviders(<App />, { route: '/dashboard' })
    expect(heading()).toHaveTextContent('Sign in')
    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in to continue.')
  })

  it('offers a way back from an unknown page', () => {
    renderWithProviders(<App />, { route: '/no-such-page' })
    expect(screen.getByRole('link', { name: 'Go to the start page' })).toHaveAttribute('href', '/')
  })
})

describe('routing when signed in', () => {
  it.each(['/', '/dashboard', '/login', '/register'])('%s shows the dashboard', (route) => {
    renderWithProviders(<App />, { route, user: JANE })
    expect(heading()).toHaveTextContent(/^Good (morning|afternoon|evening), Jane$/)
  })
})

describe('routing by role', () => {
  beforeEach(() => {
    vi.mocked(listMyTickets).mockClear()
  })

  it.each([
    ['engineer', '/', 'My queue', SAM],
    ['engineer', '/login', 'My queue', SAM],
    ['engineer', '/register', 'My queue', SAM],
    ['engineer', '/engineer', 'My queue', SAM],
    ['admin', '/', 'Facility Admin dashboard', ALEX],
    ['admin', '/login', 'Facility Admin dashboard', ALEX],
    ['admin', '/admin', 'Facility Admin dashboard', ALEX],
  ])('%s at %s sees "%s"', async (_role, route, name, user) => {
    renderWithProviders(<App />, { route, user })
    expect(heading()).toHaveTextContent(name)
    // Let the dashboard's first loads settle before the test ends.
    await act(async () => {})
  })

  it('gives engineers their queue, without calling the employee tickets API', async () => {
    renderWithProviders(<App />, { route: '/engineer', user: SAM })
    expect(await screen.findByText('Nothing to work on right now')).toBeInTheDocument()
    expect(listMyTickets).not.toHaveBeenCalled()
  })

  it('gives admins their dashboard, without calling the employee tickets API', async () => {
    renderWithProviders(<App />, { route: '/admin', user: ALEX })
    expect(await screen.findByText('Every active ticket has an engineer.')).toBeInTheDocument()
    expect(listMyTickets).not.toHaveBeenCalled()
  })

  it.each([
    ['engineer', '/dashboard', '/engineer', 'Engineer', SAM],
    ['engineer', '/tickets/new', '/engineer', 'Engineer', SAM],
    ['engineer', '/tickets/5', '/engineer', 'Engineer', SAM],
    ['engineer', '/admin', '/engineer', 'Engineer', SAM],
    ['engineer', '/admin/tickets/5', '/engineer', 'Engineer', SAM],
    ['admin', '/dashboard', '/admin', 'Facility Admin', ALEX],
    ['admin', '/engineer', '/admin', 'Facility Admin', ALEX],
    ['employee', '/engineer', '/dashboard', 'Employee', JANE],
    ['employee', '/admin', '/dashboard', 'Employee', JANE],
    ['employee', '/admin/tickets/5', '/dashboard', 'Employee', JANE],
    ['admin', '/tickets/5', '/admin', 'Facility Admin', ALEX],
    ['employee', '/admin/people', '/dashboard', 'Employee', JANE],
    ['engineer', '/admin/people', '/engineer', 'Engineer', SAM],
  ])('%s at %s is told it has no access, with a link to %s', (_role, route, home, label, user) => {
    renderWithProviders(<App />, { route, user })

    expect(heading()).toHaveTextContent("You don't have access to this")
    expect(screen.getByText(`This page isn't available to your role. You're signed in as ${label}.`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my start page' })).toHaveAttribute('href', home)
    expect(listMyTickets).not.toHaveBeenCalled()
  })

  it('takes staff from the no-access page to their own start page', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: SAM })

    await user.click(screen.getByRole('link', { name: 'Go to my start page' }))

    expect(heading()).toHaveTextContent('My queue')
    await act(async () => {})
  })
})

describe('sidebar navigation on desktop', () => {
  const nav = () => screen.getByRole('navigation', { name: 'Main' })

  it.each([
    ['/admin', 'Dashboard', 'Facility Admin dashboard'],
    ['/admin/people', 'People', 'People'],
    ['/admin/facilities', 'Facilities', 'Facilities'],
  ])('marks the current admin page at %s', async (route, current, title) => {
    renderWithProviders(<App />, { route, user: ALEX })
    expect(heading()).toHaveTextContent(title)
    expect(within(nav()).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin')
    expect(within(nav()).getByRole('link', { name: 'People' })).toHaveAttribute('href', '/admin/people')
    expect(within(nav()).getByRole('link', { name: 'Facilities' })).toHaveAttribute('href', '/admin/facilities')
    expect(within(nav()).getByRole('link', { current: 'page' })).toHaveTextContent(current)
    await act(async () => {})
  })

  it('moves between admin pages', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/admin', user: ALEX })

    await user.click(within(nav()).getByRole('link', { name: 'People' }))
    expect(heading()).toHaveTextContent('People')
    await user.click(within(nav()).getByRole('link', { name: 'Facilities' }))
    expect(heading()).toHaveTextContent('Facilities')
    await user.click(within(nav()).getByRole('link', { name: 'Dashboard' }))
    expect(heading()).toHaveTextContent('Facility Admin dashboard')
    await act(async () => {})
  })

  it('gives engineers a link to their queue, current on a ticket too', () => {
    // An invalid id shows "not found" without calling the API; the sidebar is what matters here.
    renderWithProviders(<App />, { route: '/engineer/tickets/abc', user: SAM })
    expect(within(nav()).getByRole('link', { current: 'page' })).toHaveTextContent('My queue')
    expect(within(nav()).getByRole('link', { name: 'My queue' })).toHaveAttribute('href', '/engineer')
  })

  it('gives employees Dashboard and Report an issue', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    expect(within(nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(['Dashboard', 'Report an issue'])
    expect(within(nav()).getByRole('link', { current: 'page' })).toHaveTextContent('Dashboard')

    await user.click(within(nav()).getByRole('link', { name: 'Report an issue' }))

    expect(heading()).toHaveTextContent('Report an issue')
    expect(within(nav()).getByRole('link', { current: 'page' })).toHaveTextContent('Report an issue')
    await act(async () => {})
  })

  it.each([
    ['Employee', JANE],
    ['Engineer', SAM],
    ['Facility Admin', ALEX],
  ])('labels the links with the role, %s', (label, user) => {
    renderWithProviders(<App />, { route: '/', user })
    expect(nav()).toHaveTextContent(label)
  })

  it('shows the user card and no top bar', () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE, width: 1280 })
    expect(screen.getByText('Jane Doe')).toHaveAttribute('title', 'Jane Doe')
    expect(screen.getByText('jane@acme.inc')).toBeInTheDocument()
    expect(screen.getByText('JD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
  })

  it('keeps a long name and email whole in a tooltip title', () => {
    const longName = 'Maximiliana Alexandra Worthington-Featherstonehaugh'
    const longEmail = 'maximiliana.alexandra.worthington-featherstonehaugh@acme.inc'
    renderWithProviders(<App />, { route: '/dashboard', user: { ...JANE, full_name: longName, email: longEmail } })
    expect(screen.getByText(longName)).toHaveAttribute('title', longName)
    expect(screen.getByText(longEmail)).toHaveAttribute('title', longEmail)
    expect(screen.getByText('MW')).toBeInTheDocument()
  })

  it('links the brand to the start page', () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    expect(screen.getByRole('link', { name: 'ACME Facilities Incident Desk' })).toHaveAttribute('href', '/')
  })
})

describe.each([
  ['tablet', 820],
  ['phone', 375],
])('sidebar drawer on a %s', (_device, width) => {
  const openMenu = () => screen.getByRole('button', { name: 'Open menu' })

  it('hides the links behind a menu button in the top bar', () => {
    renderWithProviders(<App />, { route: '/admin/people', user: ALEX, width })
    expect(screen.getByRole('banner')).toContainElement(openMenu())
    expect(openMenu()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'ACME Facilities Incident Desk' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByText('Alex Admin')).not.toBeInTheDocument()
  })

  it('opens the drawer, navigates and closes it again', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/admin/people', user: ALEX, width })

    await user.click(openMenu())
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Dashboard', 'People', 'Facilities'])
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveTextContent('People')
    expect(screen.getByText('Alex Admin')).toBeInTheDocument()

    await user.click(within(nav).getByRole('link', { name: 'Facilities' }))

    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument())
    expect(heading()).toHaveTextContent('Facilities')
    await act(async () => {})
  })

  it('signs out from the drawer', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE, width })

    await user.click(openMenu())
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(heading()).toHaveTextContent('Sign in'))
    expect(getSession()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
  })
})

describe('layout for guests', () => {
  it.each([375, 820, 1280])('shows only the brand at %spx wide', (width) => {
    renderWithProviders(<App />, { route: '/login', width })
    expect(screen.getByRole('link', { name: 'ACME Facilities Incident Desk' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })
})

describe('signing out', () => {
  it('signs out, forgets the session and says so', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(heading()).toHaveTextContent('Sign in')
    expect(screen.getByRole('alert')).toHaveTextContent("You've signed out.")
    expect(getSession()).toBeNull()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('sends the user to sign in when the API rejects their session', async () => {
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: 'Unknown user' }),
    }))

    await act(() => api.get('/tickets').catch(() => {}))

    expect(heading()).toHaveTextContent('Sign in')
    expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED)
  })
})

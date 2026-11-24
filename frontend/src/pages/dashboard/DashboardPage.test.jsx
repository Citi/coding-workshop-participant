import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { dashboardApi } from '../../services/dashboardApi'
import { makeAuth, renderWithProviders } from '../../test/renderWithProviders'
import { theme } from '../../theme'
import DashboardPage from './DashboardPage'
import { EMPTY_DASHBOARD, GENERATED_AT, makeDashboard, makeProjectSummary } from './dashboardFixtures'
import { formatUpdatedAt } from './dashboardUtils'

vi.mock('../../services/dashboardApi', () => ({ dashboardApi: { get: vi.fn() } }))

// On a busy machine allow slow renders instead of failing.
configure({ asyncUtilTimeout: 5000 })
const SLOW_MACHINE = { timeout: 30000 }

const ERROR_RED = 'rgb(185, 28, 28)'
const WARNING_AMBER = 'rgb(180, 83, 9)'
const LATER = '2026-11-24T12:05:00+00:00'

const SECTION_HEADINGS = [
  'Projects at risk',
  'Projects by status',
  'Key deliverables',
  'Over-allocated team members',
  'Overdue deliverables',
  'Upcoming (next 14 days)',
  'Active projects',
  'Budget: planned vs consumed',
]

function renderPage(options = {}) {
  const view = renderWithProviders(<DashboardPage />, { route: '/', path: '/', ...options })
  return { ...view, user: userEvent.setup() }
}

const findDashboard = () => screen.findByRole('region', { name: 'Key figures' })
const section = (name) => screen.getByRole('region', { name })
const kpi = (label) => within(section('Key figures')).getByText(label).closest('.MuiPaper-root')
const kpiValue = (label) => kpi(label).querySelector('.MuiTypography-h4')
/** The items of a section's list (direct children only, not nested chip lists). */
const rowsOf = (name) => [...screen.getByRole('list', { name }).children]
/** A row's date with its urgency label underneath, e.g. 'Nov 21, 2026 3 days overdue'. */
const dateIn = (row) => within(row).getByText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/).parentElement
const colorOf = (element) => getComputedStyle(element).color
// Intl puts a narrow no-break space before AM/PM; the queries compare with plain spaces.
const plain = (text) => text.replace(/\s+/g, ' ')
/** The <time> of the "Updated …" line for a generated_at value. */
const updatedTime = (generatedAt) => screen.getByText(plain(formatUpdatedAt(generatedAt)), { selector: 'time' })
const findUpdatedTime = (generatedAt) => screen.findByText(plain(formatUpdatedAt(generatedAt)), { selector: 'time' })

beforeEach(() => {
  vi.resetAllMocks()
  dashboardApi.get.mockResolvedValue(makeDashboard())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DashboardPage', SLOW_MACHINE, () => {
  it('shows a loading state, then the headline figures from one API call', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard')
    await findDashboard()
    expect(dashboardApi.get).toHaveBeenCalledTimes(1)
    expect(updatedTime(GENERATED_AT)).toHaveAttribute('datetime', GENERATED_AT)
    expect(updatedTime(GENERATED_AT).parentElement).toHaveTextContent(plain(`Updated ${formatUpdatedAt(GENERATED_AT)}`))

    expect(kpiValue('Active projects')).toHaveTextContent(/^3$/)
    expect(kpi('Active projects')).toHaveTextContent('of 5 projects')
    expect(kpiValue('Projects at risk')).toHaveTextContent(/^2$/)
    expect(kpi('Projects at risk')).toHaveTextContent('1 at risk · 1 overdue')
    expect(colorOf(kpiValue('Projects at risk'))).toBe(ERROR_RED)
    expect(kpiValue('Over-allocated')).toHaveTextContent(/^2$/)
    expect(kpi('Over-allocated')).toHaveTextContent('of 15 team members')
    expect(colorOf(kpiValue('Over-allocated'))).toBe(ERROR_RED)
    expect(kpiValue('Budget used')).toHaveTextContent(/^65\.8%$/)
    expect(kpi('Budget used')).toHaveTextContent('$164,500 of $250,000')
    expect(colorOf(kpiValue('Budget used'))).not.toBe(ERROR_RED)
    expect(kpiValue('Key deliverables')).toHaveTextContent(/^1 of 4$/)
    expect(kpi('Key deliverables')).toHaveTextContent('25% completed')
    expect(kpiValue('Overdue deliverables')).toHaveTextContent(/^3$/)
    expect(kpi('Overdue deliverables')).toHaveTextContent('2 blocked · 14 open')
    expect(colorOf(kpiValue('Overdue deliverables'))).toBe(ERROR_RED)

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(SECTION_HEADINGS)
  })

  it('colours the at-risk and budget figures by severity', async () => {
    dashboardApi.get.mockResolvedValue(
      makeDashboard({
        projects: { total: 4, by_status: { active: 4 }, by_health: { on_track: 2, at_risk: 2, overdue: 0 } },
        budget: { total_planned: 100000, total_spent: 85000, used_percent: 85, over_budget_projects: 0 },
      }),
    )
    const { unmount } = renderPage()
    await findDashboard()
    expect(kpi('Projects at risk')).toHaveTextContent('2 at risk · 0 overdue')
    expect(colorOf(kpiValue('Projects at risk'))).toBe(WARNING_AMBER)
    expect(colorOf(kpiValue('Budget used'))).toBe(WARNING_AMBER)
    unmount()

    dashboardApi.get.mockResolvedValue(
      makeDashboard({ budget: { total_planned: 100000, total_spent: 120000, used_percent: 120, over_budget_projects: 1 } }),
    )
    renderPage()
    await findDashboard()
    expect(kpiValue('Budget used')).toHaveTextContent('120%')
    expect(colorOf(kpiValue('Budget used'))).toBe(ERROR_RED)
  })

  it('explains why each project is at risk, overdue ones first', async () => {
    renderPage()
    await findDashboard()
    const [hermes, apollo] = rowsOf('Projects at risk')
    expect(within(hermes).getByRole('link', { name: 'Hermes Payments' })).toHaveAttribute('href', '/projects/3')
    expect(within(hermes).getByText('Overdue')).toHaveClass('MuiChip-label')
    expect(hermes).toHaveTextContent('Finance · 1 person')
    expect(hermes).toHaveTextContent('End date 2026-10-31 has passed')
    expect(dateIn(hermes)).toHaveTextContent('Oct 31, 2026 24 days overdue')
    expect(colorOf(within(hermes).getByText('24 days overdue'))).toBe(ERROR_RED)
    expect(within(hermes).getByRole('progressbar', { name: '70%' })).toBeInTheDocument()

    expect(within(apollo).getByRole('link', { name: 'Apollo CRM' })).toHaveAttribute('href', '/projects/1')
    expect(within(apollo).getByText('At risk')).toBeInTheDocument()
    expect(apollo).toHaveTextContent('1 deliverable(s) overdue; 1 deliverable(s) blocked')
    expect(dateIn(apollo)).toHaveTextContent('Dec 31, 2026 Ends in 5 weeks')
    expect(within(apollo).getByRole('progressbar', { name: '40%' })).toBeInTheDocument()
  })

  it('shows the status breakdown of all projects and the health of the open ones', async () => {
    renderPage()
    await findDashboard()
    const status = section('Projects by status')
    expect(status).toHaveTextContent('5 projects in total.')
    const rows = within(status).getAllByRole('listitem').slice(0, 5)
    expect(rows.map((row) => row.textContent)).toEqual([
      'Planned1 (20%)', 'Active3 (60%)', 'On hold0 (0%)', 'Completed0 (0%)', 'Cancelled1 (20%)',
    ])
    expect(within(rows[1]).getByRole('progressbar', { name: '3 (60%)' })).toHaveAttribute('aria-valuenow', '60')
    expect(within(rows[1]).getByRole('progressbar')).toHaveClass('MuiLinearProgress-colorPrimary')
    expect(within(rows[0]).getByRole('progressbar')).toHaveClass('MuiLinearProgress-colorInherit')
    const health = within(screen.getByRole('list', { name: 'Health of open projects' })).getAllByRole('listitem')
    expect(health.map((item) => item.textContent)).toEqual(['On track: 2', 'At risk: 1', 'Overdue: 1'])
  })

  it('lists key deliverables with their completion status, project, owner and due date', async () => {
    renderPage()
    await findDashboard()
    const keySection = section('Key deliverables')
    expect(within(keySection).getByRole('progressbar', { name: '1 of 4 completed' })).toHaveAttribute('aria-valuenow', '25')
    expect(within(keySection).getByRole('link', { name: 'View all key deliverables' })).toHaveAttribute('href', '/deliverables?is_key=true')

    const [signOff, goLive, uat] = rowsOf('Open key deliverables')
    expect(signOff).toHaveTextContent('Requirements sign-off')
    expect(within(signOff).getByText('In progress')).toBeInTheDocument()
    expect(within(signOff).getByRole('link', { name: 'Apollo CRM' })).toHaveAttribute('href', '/projects/1')
    expect(signOff).toHaveTextContent('Owner: Priya Shah')
    // The snapshot is from Nov 24, 2026 (generated_at), so Nov 21 is 3 days overdue.
    expect(dateIn(signOff)).toHaveTextContent('Nov 21, 2026 3 days overdue')
    expect(colorOf(within(signOff).getByText('3 days overdue'))).toBe(ERROR_RED)
    // Every item here is key, so the badge would only repeat the heading.
    expect(within(keySection).queryByText('Key')).not.toBeInTheDocument()

    expect(within(goLive).getByText('Blocked')).toBeInTheDocument()
    expect(goLive).toHaveTextContent('No owner')
    // Due within a week: amber (dark enough for 4.5:1 on white), not the overdue red.
    expect(dateIn(goLive)).toHaveTextContent('Nov 25, 2026 Due tomorrow')
    expect(within(goLive).getByText('Due tomorrow')).toHaveStyle({ color: theme.palette.warning.dark })
    expect(within(uat).getByText('Not started')).toBeInTheDocument()
    expect(dateIn(uat)).toHaveTextContent('Dec 15, 2026 Due in 3 weeks')
  })

  it('lists overdue and upcoming deliverables with links to the filtered deliverables list', async () => {
    renderPage()
    await findDashboard()
    const overdue = rowsOf('Overdue deliverables')
    expect(overdue.map((row) => dateIn(row).textContent)).toEqual([
      'Nov 10, 2026 14 days overdue',
      'Nov 21, 2026 3 days overdue',
      'Nov 23, 2026 1 day overdue',
    ])
    expect(colorOf(within(overdue[2]).getByText('1 day overdue'))).toBe(ERROR_RED)
    expect(within(overdue[0]).queryByText('Key')).not.toBeInTheDocument()
    expect(within(overdue[1]).getByText('Key')).toBeInTheDocument()
    expect(within(section('Overdue deliverables')).getByRole('link', { name: 'View all overdue deliverables' })).toHaveAttribute(
      'href',
      '/deliverables?overdue=true',
    )

    const upcoming = rowsOf('Upcoming deliverables')
    expect(upcoming.map((row) => dateIn(row).textContent)).toEqual([
      'Nov 24, 2026 Due today',
      'Nov 25, 2026 Due tomorrow',
      'Dec 1, 2026 Due in 7 days',
    ])
    expect(within(upcoming[1]).getByText('Key')).toBeInTheDocument()
    expect(within(section('Upcoming (next 14 days)')).getByRole('link', { name: 'View all deliverables' })).toHaveAttribute(
      'href',
      '/deliverables',
    )
  })

  it("words due and end dates against the snapshot's date, not the viewer's clock", async () => {
    // A week after the snapshot (and in another month): the lists the API sent are still worded for its day.
    vi.setSystemTime(new Date('2026-12-01T12:00:00Z'))
    renderPage()
    await findDashboard()
    expect(dateIn(rowsOf('Upcoming deliverables')[0])).toHaveTextContent('Nov 24, 2026 Due today')
    expect(dateIn(rowsOf('Overdue deliverables')[2])).toHaveTextContent('Nov 23, 2026 1 day overdue')
    expect(dateIn(rowsOf('Active projects')[1])).toHaveTextContent('Dec 31, 2026 Ends in 5 weeks')

    // A snapshot taken late on Nov 24 in New York is already Nov 25 in UTC, the API's business date.
    dashboardApi.get.mockResolvedValue(makeDashboard({ generated_at: '2026-11-24T21:30:00-05:00' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(dateIn(rowsOf('Upcoming deliverables')[0])).toHaveTextContent('Nov 24, 2026 1 day overdue'))
    expect(dateIn(rowsOf('Upcoming deliverables')[1])).toHaveTextContent('Nov 25, 2026 Due today')
  })

  it('shows over-allocated people with the allocations behind their total', async () => {
    renderPage()
    await findDashboard()
    const team = section('Over-allocated team members')
    expect(within(team).getByRole('link', { name: 'View all over-allocated team members' })).toHaveAttribute(
      'href',
      '/resources?over_allocated=true',
    )
    const [priya, tom] = rowsOf('Over-allocated team members')
    expect(within(priya).getByRole('link', { name: 'Priya Shah' })).toHaveAttribute('href', '/resources/4')
    expect(priya).toHaveTextContent('Developer · IT')
    expect(colorOf(within(priya).getByText('120%'))).toBe(ERROR_RED)
    const allocations = within(screen.getByRole('list', { name: 'Active project allocations of Priya Shah' })).getAllByRole('listitem')
    expect(allocations.map((item) => item.textContent)).toEqual(['Apollo CRM: 60%', 'Hermes Payments: 60%'])
    expect(within(tom).getByText('110%')).toBeInTheDocument()
  })

  it('shows each active project with its health, progress, end date and budget use', async () => {
    const { user } = renderPage()
    await findDashboard()
    expect(within(section('Active projects')).getByRole('link', { name: 'View all projects' })).toHaveAttribute('href', '/projects')
    const [hermes, apollo, zeus] = rowsOf('Active projects')
    expect(within(hermes).getByRole('link', { name: 'Hermes Payments' })).toBeInTheDocument()
    expect(within(hermes).getByRole('progressbar', { name: '107.5%' })).toHaveClass('MuiLinearProgress-colorError')
    expect(within(apollo).getByRole('progressbar', { name: '40%' })).toHaveClass('MuiLinearProgress-colorPrimary')
    expect(within(apollo).getByRole('progressbar', { name: '40.7%' })).toHaveClass('MuiLinearProgress-colorPrimary')
    expect(dateIn(hermes)).toHaveTextContent('Oct 31, 2026 24 days overdue')
    expect(dateIn(apollo)).toHaveTextContent('Dec 31, 2026 Ends in 5 weeks')
    expect(dateIn(zeus)).toHaveTextContent('Mar 31, 2027 Ends in 4 months')
    expect(within(zeus).getByText('On track')).toBeInTheDocument()
    expect(within(zeus).getByRole('progressbar', { name: 'No budget' })).toHaveClass('MuiLinearProgress-colorError')

    await user.hover(within(apollo).getByText('At risk'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('1 deliverable(s) blocked')
  })

  it('compares planned and consumed budget per project, highest share first', async () => {
    renderPage()
    await findDashboard()
    const budget = section('Budget: planned vs consumed')
    expect(budget).toHaveTextContent('2 projects over budget')
    expect(within(budget).getByRole('link', { name: 'View all project budgets' })).toHaveAttribute('href', '/budget')

    const [zeus, hermes, orion, apollo] = rowsOf('Budget by project')
    expect(within(zeus).getByRole('link', { name: 'Zeus ERP' })).toHaveAttribute('href', '/projects/2')
    expect(within(zeus).getByRole('progressbar', { name: 'No budget' })).toHaveClass('MuiLinearProgress-colorError')
    expect(zeus).toHaveTextContent('$500 of $0 spent · $500 over budget')
    expect(within(zeus).getByText('Over budget')).toBeInTheDocument()
    expect(within(hermes).getByRole('progressbar', { name: '107.5%' })).toHaveClass('MuiLinearProgress-colorError')
    expect(colorOf(within(hermes).getByText('$6,000 over budget'))).toBe(ERROR_RED)
    expect(within(orion).getByRole('progressbar', { name: '85%' })).toHaveClass('MuiLinearProgress-colorWarning')
    expect(orion).toHaveTextContent('$17,000 of $20,000 spent · $3,000 left')
    expect(within(orion).queryByText('Over budget')).not.toBeInTheDocument()
    expect(within(apollo).getByRole('progressbar', { name: '40.7%' })).toHaveClass('MuiLinearProgress-colorPrimary')
  })

  it('shows the first five rows of a long list and can show the rest', async () => {
    const projects = Array.from({ length: 7 }, (_, index) => makeProjectSummary({ id: 100 + index, name: `Project ${index + 1}` }))
    dashboardApi.get.mockResolvedValue(makeDashboard({ active_projects: projects }))
    const { user } = renderPage()
    await findDashboard()
    expect(rowsOf('Active projects')).toHaveLength(5)
    const more = within(section('Active projects')).getByRole('button', { name: 'Show 2 more' })
    expect(more).toHaveAttribute('aria-expanded', 'false')

    await user.click(more)
    expect(rowsOf('Active projects')).toHaveLength(7)
    const fewer = within(section('Active projects')).getByRole('button', { name: 'Show fewer' })
    expect(fewer).toHaveAttribute('aria-expanded', 'true')
    await user.click(fewer)
    expect(rowsOf('Active projects')).toHaveLength(5)
    // Short lists have no toggle.
    expect(within(section('Projects at risk')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('refreshes on request, keeping the current figures visible while it loads', async () => {
    let finishRefresh
    dashboardApi.get
      .mockResolvedValueOnce(makeDashboard())
      .mockImplementationOnce(() => new Promise((resolve) => (finishRefresh = resolve)))
    const { user } = renderPage()
    await findDashboard()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('progressbar', { name: 'Refreshing the dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(kpiValue('Overdue deliverables')).toHaveTextContent(/^3$/)

    finishRefresh(makeDashboard({ generated_at: LATER, deliverables: { ...makeDashboard().deliverables, overdue: 4 } }))
    await waitFor(() => expect(kpiValue('Overdue deliverables')).toHaveTextContent(/^4$/))
    expect(dashboardApi.get).toHaveBeenCalledTimes(2)
    expect(updatedTime(LATER)).toHaveAttribute('datetime', LATER)
    expect(screen.queryByRole('progressbar', { name: 'Refreshing the dashboard' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('tells screen readers when a refresh has brought new figures, but not about the first load', async () => {
    const SAME_MINUTE = '2026-11-24T12:05:30+00:00'
    let finishRefresh
    dashboardApi.get
      .mockResolvedValueOnce(makeDashboard())
      .mockImplementationOnce(() => new Promise((resolve) => (finishRefresh = resolve)))
      .mockResolvedValueOnce(makeDashboard({ generated_at: SAME_MINUTE }))
    const { user } = renderPage()
    // The polite message beside the Refresh button: there from the start, empty during the first load.
    const announcer = screen.getByRole('button', { name: 'Refresh' }).parentElement.querySelector('[aria-live="polite"]')
    expect(announcer).toHaveAttribute('aria-atomic', 'true')
    expect(announcer).not.toHaveAttribute('role')
    expect(announcer).toBeEmptyDOMElement()

    await findDashboard()
    expect(announcer).toBeEmptyDOMElement()
    // The visible time is not a live region of its own (it would be read out twice).
    expect(updatedTime(GENERATED_AT).closest('[aria-live]')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('progressbar', { name: 'Refreshing the dashboard' })).toBeInTheDocument()
    expect(announcer).toBeEmptyDOMElement()
    finishRefresh(makeDashboard({ generated_at: LATER }))
    const announced = plain(`Dashboard updated at ${formatUpdatedAt(LATER)}`)
    await waitFor(() => expect(announcer).toHaveTextContent(announced))
    const first = announcer.firstElementChild

    // Another snapshot in the same minute reads the same: a new element, so it is announced again.
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(announcer.firstElementChild).not.toBe(first))
    expect(announcer).toHaveTextContent(announced)
    expect(dashboardApi.get).toHaveBeenCalledTimes(3)
  })

  it('keeps the last figures when a refresh fails and retries on request', async () => {
    dashboardApi.get
      .mockResolvedValueOnce(makeDashboard())
      .mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The database is not available' }))
      .mockResolvedValueOnce(makeDashboard({ generated_at: LATER }))
    const { user } = renderPage()
    await findDashboard()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not refresh the dashboard. The database is not available')
    expect(section('Projects at risk')).toBeInTheDocument()
    expect(updatedTime(GENERATED_AT)).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await findUpdatedTime(LATER)).toHaveAttribute('datetime', LATER)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(dashboardApi.get).toHaveBeenCalledTimes(3)
  })

  it('shows an error with Retry when the dashboard cannot be loaded', async () => {
    dashboardApi.get
      .mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server.' }))
      .mockResolvedValueOnce(makeDashboard())
    const { user } = renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load the dashboard. Cannot reach the server.')
    expect(screen.queryByRole('region', { name: 'Key figures' })).not.toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await findDashboard()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(dashboardApi.get).toHaveBeenCalledTimes(2)
  })

  it('explains every empty section of a new installation', async () => {
    dashboardApi.get.mockResolvedValue(EMPTY_DASHBOARD)
    renderPage()
    await findDashboard()
    const emptyTitles = {
      'Projects at risk': 'No projects at risk',
      'Projects by status': 'No projects yet',
      'Key deliverables': 'No open key deliverables',
      'Over-allocated team members': 'Nobody is over-allocated',
      'Overdue deliverables': 'Nothing overdue',
      'Upcoming (next 14 days)': 'Nothing due soon',
      'Active projects': 'No active projects',
      'Budget: planned vs consumed': 'No budgets to show',
    }
    Object.entries(emptyTitles).forEach(([name, title]) => expect(within(section(name)).getByText(title)).toBeInTheDocument())
    expect(section('Key deliverables')).toHaveTextContent('Mark the most important deliverables as key to follow them here.')
    expect(within(section('Key deliverables')).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(section('Over-allocated team members')).toHaveTextContent('Team members show here once they are added.')
    expect(section('Budget: planned vs consumed')).not.toHaveTextContent('over budget')

    expect(kpi('Projects at risk')).toHaveTextContent('All open projects are on track')
    expect(kpiValue('Budget used')).toHaveTextContent(/^0%$/)
    expect(kpi('Budget used')).toHaveTextContent('No budget planned yet')
    expect(kpiValue('Key deliverables')).toHaveTextContent(/^0 of 0$/)
    expect(kpi('Key deliverables')).toHaveTextContent('No key deliverables yet')
  })

  it('says when every key deliverable is done and nobody is over-allocated', async () => {
    dashboardApi.get.mockResolvedValue(
      makeDashboard({
        deliverables: { total: 4, completed: 4, overdue: 0, blocked: 0, key_total: 2, key_completed: 2 },
        key_deliverables: [],
        resources: { total: 15, over_allocated: 0 },
        over_allocated_resources: [],
      }),
    )
    renderPage()
    await findDashboard()
    expect(section('Key deliverables')).toHaveTextContent('Every key deliverable is completed.')
    expect(within(section('Key deliverables')).getByRole('progressbar', { name: '2 of 2 completed' })).toHaveAttribute('aria-valuenow', '100')
    expect(section('Over-allocated team members')).toHaveTextContent('Everyone is allocated 100% or less (15 team members).')
    expect(colorOf(kpiValue('Over-allocated'))).not.toBe(ERROR_RED)
  })

  it.each(['admin', 'manager', 'contributor', 'viewer'])(
    'shows the whole dashboard to a %s, with links but no create, edit or delete controls',
    async (role) => {
      renderPage({ role })
      await findDashboard()
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(SECTION_HEADINGS.length)
      expect(screen.queryByRole('button', { name: /new|edit|delete/i })).not.toBeInTheDocument()
      expect(within(section('Over-allocated team members')).getByRole('link', { name: 'Priya Shah' })).toBeInTheDocument()
      expect(within(section('Budget: planned vs consumed')).getByRole('link', { name: 'View all project budgets' })).toBeInTheDocument()
    },
  )

  it('shows names without links when the role may not open the other pages', async () => {
    renderPage({ auth: makeAuth({ permissions: ['dashboard:read'] }) })
    await findDashboard()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(within(rowsOf('Projects at risk')[0]).getByText('Hermes Payments')).toBeInTheDocument()
    expect(within(rowsOf('Over-allocated team members')[0]).getByText('Priya Shah')).toBeInTheDocument()
  })
})

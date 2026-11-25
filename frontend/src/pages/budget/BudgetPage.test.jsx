import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { projectsApi } from '../../services/projectsApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { APOLLO, ATLAS, HERMES, listOf, makeProject, ORION, ZEUS } from './budgetFixtures'
import BudgetPage from './BudgetPage'

vi.mock('../../services/projectsApi', () => ({ projectsApi: { list: vi.fn() } }))
// The expenses panel has its own tests; here it only needs to report a change.
vi.mock('./ExpensesPanel', () => ({
  default: ({ projectId, onChange }) => (
    <button type="button" onClick={onChange} data-project-id={projectId ?? 'all'}>
      Simulate an expense change
    </button>
  ),
}))

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

const ERROR_RED = 'rgb(185, 28, 28)'

// On a busy machine allow slow renders instead of failing.
configure({ asyncUtilTimeout: 5000 })
const SLOW_MACHINE = { timeout: 30000 }

function renderPage() {
  renderWithProviders(<BudgetPage />, { route: '/budget', path: '/budget' })
  return { user: userEvent.setup({ delay: null }) }
}

const findTable = () => screen.findByRole('table', { name: 'Planned vs consumed by project' })
/** The KPI tile whose label is `label` (labels are paragraphs; table headers use the same words). */
const card = (label) => screen.getByText(label, { selector: 'p' }).closest('.MuiPaper-root')
const cardValue = (label) => within(card(label)).getByText((_text, element) => element.tagName === 'P' && element.className.includes('h4'))
const rowOf = (name) => screen.getByRole('link', { name }).closest('tr')

beforeEach(() => {
  vi.resetAllMocks()
  mobile.value = false
  projectsApi.list.mockResolvedValue(listOf(APOLLO, ZEUS, HERMES, ORION, ATLAS))
})

describe('BudgetPage', SLOW_MACHINE, () => {
  it('shows a loading state, then the portfolio totals without cancelled projects', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading budget')
    await findTable()
    expect(projectsApi.list).toHaveBeenCalledTimes(1)

    expect(cardValue('Planned budget')).toHaveTextContent('$220,000')
    expect(card('Planned budget')).toHaveTextContent('Across 4 projects (cancelled excluded)')
    expect(cardValue('Spent')).toHaveTextContent('$139,500')
    expect(card('Spent')).toHaveTextContent('63.4% of the planned budget')
    expect(cardValue('Remaining')).toHaveTextContent('$80,500')
    expect(card('Remaining')).toHaveTextContent('Left to spend')
    expect(cardValue('Over-budget projects')).toHaveTextContent('2')
    expect(getComputedStyle(cardValue('Over-budget projects')).color).toBe(ERROR_RED)
    expect(card('Over-budget projects')).toHaveTextContent('Spent more than their planned budget')
  })

  it('lists planned vs consumed budget per project, highest share used first', async () => {
    renderPage()
    const table = await findTable()
    expect(screen.getByRole('heading', { level: 2, name: 'Planned vs consumed by project' })).toBeInTheDocument()
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Project', 'Status', 'Planned', 'Spent', 'Remaining', 'Used', 'Budget status',
    ])
    expect(within(table).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Hermes Payments', 'Zeus ERP', 'Orion Analytics', 'Apollo CRM',
    ])
    expect(screen.queryByText('Atlas Migration')).not.toBeInTheDocument()

    const zeus = rowOf('Zeus ERP')
    expect(within(zeus).getByRole('link', { name: 'Zeus ERP' })).toHaveAttribute('href', '/projects/2')
    expect(within(zeus).getByText('Active')).toBeInTheDocument()
    expect(within(zeus).getByText('$50,000.00')).toBeInTheDocument()
    expect(within(zeus).getByText('$60,000.00')).toBeInTheDocument()
    expect(getComputedStyle(within(zeus).getByText('-$10,000.00')).color).toBe(ERROR_RED)
    expect(within(zeus).getByRole('progressbar', { name: '120%' })).toHaveClass('MuiLinearProgress-colorError')
    expect(within(zeus).getByText('Over budget')).toBeInTheDocument()

    const hermes = rowOf('Hermes Payments')
    expect(within(hermes).getByRole('progressbar', { name: 'No budget' })).toHaveClass('MuiLinearProgress-colorError')
    expect(within(hermes).getByText('Over budget')).toBeInTheDocument()

    const orion = rowOf('Orion Analytics')
    expect(within(orion).getByText('Completed')).toBeInTheDocument()
    expect(within(orion).getByRole('progressbar', { name: '90%' })).toHaveClass('MuiLinearProgress-colorWarning')
    expect(within(orion).getByText('Within budget')).toBeInTheDocument()

    const apollo = rowOf('Apollo CRM')
    expect(within(apollo).getByRole('progressbar', { name: '40.7%' })).toHaveClass('MuiLinearProgress-colorPrimary')
    expect(getComputedStyle(within(apollo).getByText('$89,000.00')).color).not.toBe(ERROR_RED)
  })

  it('shows every expense in its own section and refreshes the budget when one changes', async () => {
    const { user } = renderPage()
    await findTable()
    const expenses = screen.getByRole('region', { name: 'Expenses' })
    const panel = within(expenses).getByRole('button', { name: 'Simulate an expense change' })
    expect(panel).toHaveAttribute('data-project-id', 'all')

    projectsApi.list.mockResolvedValue(listOf(makeProject({ budget: 1000, budget_spent: 250 })))
    await user.click(panel)
    await waitFor(() => expect(projectsApi.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(cardValue('Spent')).toHaveTextContent('$250'))
    expect(cardValue('Planned budget')).toHaveTextContent('$1,000')
  })

  it('shows the error with a Retry button when the budget cannot be loaded', async () => {
    projectsApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The database is unavailable' }))
    const { user } = renderPage()
    expect(await screen.findByText(/The database is unavailable/)).toHaveTextContent('Could not load the budget.')
    expect(screen.getByRole('button', { name: 'Simulate an expense change' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findTable()).toBeInTheDocument()
    expect(projectsApi.list).toHaveBeenCalledTimes(2)
  })

  it('keeps the last figures and offers a retry when a refresh fails', async () => {
    const { user } = renderPage()
    await findTable()
    projectsApi.list.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected error' }))
    await user.click(screen.getByRole('button', { name: 'Simulate an expense change' }))
    expect(await screen.findByText(/Could not refresh the budget figures/)).toBeInTheDocument()
    expect(cardValue('Planned budget')).toHaveTextContent('$220,000')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText(/Could not refresh the budget figures/)).not.toBeInTheDocument())
  })

  it('flags an overspent portfolio', async () => {
    projectsApi.list.mockResolvedValue(listOf(ZEUS))
    renderPage()
    await findTable()
    expect(cardValue('Remaining')).toHaveTextContent('-$10,000')
    expect(getComputedStyle(cardValue('Remaining')).color).toBe(ERROR_RED)
    expect(card('Remaining')).toHaveTextContent('Spending is above the planned budget')
    expect(card('Spent')).toHaveTextContent('120% of the planned budget')
  })

  it('explains an empty portfolio', async () => {
    projectsApi.list.mockResolvedValue(listOf(ATLAS))
    renderPage()
    expect(await screen.findByText('No projects to show')).toBeInTheDocument()
    expect(cardValue('Planned budget')).toHaveTextContent('$0')
    expect(card('Planned budget')).toHaveTextContent('Across 0 projects')
    expect(card('Spent')).toHaveTextContent('No budget planned yet')
    expect(cardValue('Over-budget projects')).toHaveTextContent('0')
    expect(card('Over-budget projects')).toHaveTextContent('All projects are within budget')
  })

  it('shows projects as cards on mobile, without the status and remaining columns', async () => {
    mobile.value = true
    renderPage()
    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(4)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(cards[0]).getByRole('link', { name: 'Hermes Payments' })).toBeInTheDocument()
    expect(within(cards[0]).getByText('Budget status')).toBeInTheDocument()
    expect(within(cards[0]).queryByText('Remaining')).not.toBeInTheDocument()
    expect(within(cards[0]).queryByText('Status')).not.toBeInTheDocument()
  })
})

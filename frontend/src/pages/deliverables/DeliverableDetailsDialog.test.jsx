import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { deliverablesApi } from '../../services/deliverablesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import DeliverableDetailsDialog from './DeliverableDetailsDialog'
import { BUILD, BUILD_DETAILS, INTERVIEWS, SIGN_OFF, SIGN_OFF_DETAILS } from './deliverableFixtures'

vi.mock('../../services/deliverablesApi', () => ({ deliverablesApi: { get: vi.fn() } }))

const DETAILS = { 10: SIGN_OFF_DETAILS, 12: BUILD_DETAILS }
// Due dates are worded relative to today (UTC), so the tests run on a fixed day: Mar 4, 2026.
const TODAY = new Date('2026-03-04T12:00:00Z')

function renderDialog(deliverable = SIGN_OFF) {
  const onClose = vi.fn()
  renderWithProviders(<DeliverableDetailsDialog open deliverable={deliverable} onClose={onClose} />)
  return { onClose, user: userEvent.setup() }
}

/** The value next to the "Due date" label of the facts. */
const dueDateFact = () => screen.getByText('Due date', { selector: 'dt' }).nextElementSibling

describe('DeliverableDetailsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Only Date is faked: timers stay real for Testing Library and user-event.
    vi.setSystemTime(TODAY)
    deliverablesApi.get.mockImplementation((id) => Promise.resolve(DETAILS[id]))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the facts, direct prerequisites, full dependency chain and dependents', async () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Requirements sign-off' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading deliverable')
    expect(await screen.findByText('Scope agreed with sales')).toBeInTheDocument()
    expect(deliverablesApi.get).toHaveBeenCalledWith(10)

    expect(screen.getByText('Key deliverable')).toBeInTheDocument()
    expect(screen.getByText('Priya Shah')).toBeInTheDocument()
    expect(dueDateFact()).toHaveTextContent('Mar 1, 2026 3 days overdue')
    expect(screen.getByRole('link', { name: 'Apollo CRM' })).toHaveAttribute('href', '/projects/1')
    expect(screen.getByRole('heading', { level: 3, name: 'Depends on (2)' })).toBeInTheDocument()

    const direct = screen.getByRole('list', { name: 'Direct prerequisites' })
    expect(within(direct).getAllByRole('listitem')).toHaveLength(2)
    expect(within(direct).getAllByText('Blocker')).toHaveLength(1)

    const chain = within(screen.getByRole('list', { name: 'Dependency chain' })).getAllByRole('listitem')
    expect(chain.map((item) => item.getAttribute('data-depth'))).toEqual(['1', '1', '2'])
    expect(chain[0]).toHaveTextContent('Stakeholder interviews')
    // Completed: its due date has no urgency.
    expect(chain[0]).toHaveTextContent('Apollo CRM · Due Feb 1, 2026 · Level 1 (direct)')
    expect(chain[0]).not.toHaveTextContent('Blocker')
    expect(chain[1]).toHaveTextContent('Data audit')
    expect(chain[1]).toHaveTextContent('Zeus ERP · Due Dec 20, 2026 · in 9 months · Level 1 (direct)')
    expect(chain[1]).toHaveTextContent('Blocker')
    expect(chain[2]).toHaveTextContent('Vendor contract')
    expect(chain[2]).toHaveTextContent('Zeus ERP · Due Jan 10, 2026 · 53 days overdue · Level 2')
    expect(chain[2]).toHaveTextContent('Blocker')
    expect(screen.getByText('2 of 3 prerequisites are not completed yet and block this deliverable.')).toBeInTheDocument()

    const blocks = screen.getByRole('list', { name: 'Deliverables that depend on this one' })
    expect(blocks).toHaveTextContent('Build MVP')
    expect(blocks).toHaveTextContent('Apollo CRM · Due Jan 15, 2027 · in 10 months')
    expect(blocks).not.toHaveTextContent('Due in')
    expect(blocks).not.toHaveTextContent('Blocker')
  })

  it('opens related deliverables in place and goes back along the path', async () => {
    const { user } = renderDialog()
    const blocks = await screen.findByRole('list', { name: 'Deliverables that depend on this one' })
    await user.click(within(blocks).getByRole('button', { name: /Build MVP/ }))

    expect(await screen.findByRole('dialog', { name: 'Build MVP' })).toBeInTheDocument()
    expect(await screen.findByText('Dependency chain (4)')).toBeInTheDocument()
    expect(deliverablesApi.get).toHaveBeenLastCalledWith(12)
    expect(screen.getByText('3 of 4 prerequisites are not completed yet and block this deliverable.')).toBeInTheDocument()
    expect(screen.getByText('No other deliverable depends on this one.')).toBeInTheDocument()
    expect(screen.getByText('No description.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to Requirements sign-off' }))
    expect(await screen.findByText('Scope agreed with sales')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back to/ })).not.toBeInTheDocument()
  })

  it('explains a deliverable without dependencies', async () => {
    deliverablesApi.get.mockResolvedValue({ ...INTERVIEWS, depends_on: [], dependency_chain: [], blocks: [] })
    renderDialog(INTERVIEWS)
    expect(await screen.findByText('Does not depend on any other deliverable.')).toBeInTheDocument()
    expect(screen.getByText('No prerequisites: nothing has to be finished first.')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    // Completed, so the date alone: finished work is not urgent.
    expect(dueDateFact()).toHaveTextContent(/^Feb 1, 2026$/)
    expect(screen.queryByText('Key deliverable')).not.toBeInTheDocument()
  })

  it('uses the singular when one prerequisite is still open', async () => {
    deliverablesApi.get.mockResolvedValueOnce({ ...SIGN_OFF_DETAILS, dependency_chain: SIGN_OFF_DETAILS.dependency_chain.slice(1) })
    renderDialog()
    expect(await screen.findByText('1 of 2 prerequisites is not completed yet and blocks this deliverable.')).toBeInTheDocument()
  })

  it('confirms when every prerequisite is completed', async () => {
    const done = (item) => ({ ...item, status: 'completed' })
    deliverablesApi.get.mockResolvedValueOnce({
      ...BUILD_DETAILS,
      depends_on: BUILD_DETAILS.depends_on.map(done),
      dependency_chain: BUILD_DETAILS.dependency_chain.map(done),
    })
    const { user } = renderDialog(BUILD)
    expect(await screen.findByText('All 4 prerequisites are completed.')).toBeInTheDocument()
    expect(screen.queryByText('Blocker')).not.toBeInTheDocument()

    deliverablesApi.get.mockResolvedValueOnce({ ...SIGN_OFF_DETAILS, dependency_chain: [done({ ...SIGN_OFF_DETAILS.dependency_chain[2] })] })
    await user.click(within(screen.getByRole('list', { name: 'Direct prerequisites' })).getByRole('button', { name: /Requirements sign-off/ }))
    expect(await screen.findByText('Its only prerequisite is completed.')).toBeInTheDocument()
  })

  it('shows a load error with Retry', async () => {
    deliverablesApi.get.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' }))
    const { user } = renderDialog()
    expect(await screen.findByText(/Database unavailable/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Scope agreed with sales')).toBeInTheDocument()
  })

  it('says a deleted deliverable no longer exists, without a Retry that cannot succeed', async () => {
    deliverablesApi.get.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Deliverable not found' }))
    renderDialog()
    expect(await screen.findByText('Deliverable not found')).toBeInTheDocument()
    expect(screen.getByText('This deliverable does not exist or has been deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('closes from the close buttons and when following the project link', async () => {
    const { onClose, user } = renderDialog()
    await screen.findByText('Scope agreed with sales')
    await user.click(screen.getByRole('button', { name: 'Close details' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('link', { name: 'Apollo CRM' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('renders nothing while closed', () => {
    renderWithProviders(<DeliverableDetailsDialog open={false} deliverable={null} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deliverablesApi.get).not.toHaveBeenCalled()
  })
})

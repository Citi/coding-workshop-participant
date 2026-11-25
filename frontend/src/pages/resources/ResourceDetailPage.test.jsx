import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import ResourceDetailPage from './ResourceDetailPage'
import { MARIA, PRIYA_DETAILS, TOM_DETAILS } from './resourceFixtures'

vi.mock('../../services/resourcesApi', () => ({
  resourcesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
// The panel has its own tests; here we only check what the page hands to it.
vi.mock('./AllocationsPanel', () => ({
  default: ({ resourceId, onChange, title }) => (
    <section>
      <h2>{title}</h2>
      <button type="button" onClick={onChange}>
        Change allocations of resource {resourceId}
      </button>
    </section>
  ),
}))

function renderDetail({ id = '4', role } = {}) {
  renderWithProviders(<ResourceDetailPage />, {
    route: `/resources/${id}`,
    path: '/resources/:resourceId',
    role,
    extraRoutes: [{ path: '/resources', element: <p>Resources list page</p> }],
  })
  return userEvent.setup({ delay: null })
}

describe('ResourceDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resourcesApi.get.mockResolvedValue(PRIYA_DETAILS)
  })

  it('shows the person, their utilization and why they are over-allocated', async () => {
    renderDetail()
    expect(screen.getByRole('status')).toHaveTextContent('Loading team member')
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })).toBeInTheDocument()
    expect(resourcesApi.get).toHaveBeenCalledWith(4)
    expect(screen.getByText('Developer · IT')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'priya@acme.com' })).toHaveAttribute('href', 'mailto:priya@acme.com')
    expect(screen.getByRole('link', { name: 'All resources' })).toHaveAttribute('href', '/resources')

    const utilization = screen.getByRole('region', { name: 'Utilization' })
    const alert = within(utilization).getByRole('alert')
    expect(alert).toHaveTextContent('Over-allocated')
    expect(alert).toHaveTextContent('Priya Shah is allocated 120% across 2 active projects, 20% more than full time.')
    expect(within(utilization).getByText('Total allocation').nextSibling).toHaveTextContent('120%')
    expect(within(utilization).getByText('Active projects').nextSibling).toHaveTextContent('2')
    expect(within(utilization).getByText('Over capacity by').nextSibling).toHaveTextContent('20%')
    expect(within(utilization).getByRole('progressbar', { name: '120%' })).toHaveClass('MuiLinearProgress-colorError')
    expect(utilization).toHaveTextContent('Allocated 120% across 2 active projects. Only allocations to active projects count')

    expect(screen.getByRole('heading', { level: 2, name: 'Project allocations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change allocations of resource 4' })).toBeInTheDocument()
  })

  it('shows spare capacity and no warning when the person is not over-allocated', async () => {
    resourcesApi.get.mockResolvedValue(TOM_DETAILS)
    renderDetail({ id: '5' })
    const utilization = await screen.findByRole('region', { name: 'Utilization' })
    expect(within(utilization).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(utilization).getByText('Available capacity').nextSibling).toHaveTextContent('60%')
    expect(within(utilization).getByRole('progressbar', { name: '40%' })).toHaveClass('MuiLinearProgress-colorPrimary')
    expect(utilization).toHaveTextContent('Allocated 40% across 1 active project.')
  })

  it('says so when the person has no active project', async () => {
    resourcesApi.get.mockResolvedValue({ ...MARIA, allocations: [] })
    renderDetail({ id: '6' })
    const utilization = await screen.findByRole('region', { name: 'Utilization' })
    expect(utilization).toHaveTextContent('Not allocated to any active project.')
    expect(within(utilization).getByText('Available capacity').nextSibling).toHaveTextContent('100%')
  })

  it('reloads the totals after the allocations change', async () => {
    const user = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })
    resourcesApi.get.mockResolvedValue({ ...PRIYA_DETAILS, total_allocation_percent: 90, is_over_allocated: false })
    await user.click(screen.getByRole('button', { name: 'Change allocations of resource 4' }))
    await waitFor(() => expect(resourcesApi.get).toHaveBeenCalledTimes(2))
    const utilization = screen.getByRole('region', { name: 'Utilization' })
    await waitFor(() => expect(within(utilization).queryByRole('alert')).not.toBeInTheDocument())
    expect(within(utilization).getByText('Available capacity').nextSibling).toHaveTextContent('10%')
  })

  it('shows a friendly page with a way back when the person does not exist', async () => {
    resourcesApi.get.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Resource not found' }))
    const user = renderDetail({ id: '99' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Resource not found' })).toBeInTheDocument()
    expect(screen.getByText('This team member does not exist or has been deleted.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to resources' }))
    expect(await screen.findByText('Resources list page')).toBeInTheDocument()
  })

  it('treats an invalid id as not found without calling the API', () => {
    renderDetail({ id: 'abc' })
    expect(screen.getByText('Resource not found')).toBeInTheDocument()
    expect(resourcesApi.get).not.toHaveBeenCalled()
  })

  it('treats an id beyond the API integer range as not found (the API would answer 400, not 404)', () => {
    renderDetail({ id: '2147483648' })
    expect(screen.getByText('Resource not found')).toBeInTheDocument()
    expect(resourcesApi.get).not.toHaveBeenCalled()
  })

  it('shows other errors with a working Retry button', async () => {
    resourcesApi.get.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error' }))
    const user = renderDetail()
    expect(await screen.findByText(/Unexpected server error/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All resources' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })).toBeInTheDocument()
  })

  it('keeps the page and offers Retry when a refresh fails', async () => {
    const user = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })
    resourcesApi.get.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server.' }))
    await user.click(screen.getByRole('button', { name: 'Change allocations of resource 4' }))
    expect(await screen.findByText(/Could not refresh the team member/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Priya Shah' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText(/Could not refresh the team member/)).not.toBeInTheDocument())
  })

  it('edits the person and shows the saved details', async () => {
    resourcesApi.update.mockResolvedValue({ ...PRIYA_DETAILS, job_title: 'Tech Lead' })
    const user = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit resource' })
    const jobTitle = within(dialog).getByLabelText(/Job title/)
    expect(jobTitle).toHaveValue('Developer')
    await user.clear(jobTitle)
    await user.type(jobTitle, 'Tech Lead')
    resourcesApi.get.mockResolvedValue({ ...PRIYA_DETAILS, job_title: 'Tech Lead' })
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(resourcesApi.update).toHaveBeenCalledWith(4, {
        full_name: 'Priya Shah',
        email: 'priya@acme.com',
        job_title: 'Tech Lead',
        department: 'IT',
      }),
    )
    expect(await screen.findByText('Resource updated')).toBeInTheDocument()
    expect(await screen.findByText('Tech Lead · IT')).toBeInTheDocument()
    expect(resourcesApi.get).toHaveBeenCalledTimes(2)
  })

  it('deletes the person after confirmation and returns to the list', async () => {
    resourcesApi.remove.mockResolvedValue(null)
    const user = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete resource?' })
    expect(dialog).toHaveTextContent('they are currently on 2 active projects')
    expect(dialog).toHaveTextContent('any deliverables they own will become unassigned')
    await user.click(within(dialog).getByRole('button', { name: 'Delete resource' }))

    await waitFor(() => expect(resourcesApi.remove).toHaveBeenCalledWith(4))
    expect(await screen.findByText('Resources list page')).toBeInTheDocument()
    expect(screen.getByText('Resource deleted')).toBeInTheDocument()
  })

  it('hides Edit and Delete from a viewer', async () => {
    renderDetail({ role: 'viewer' })
    await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('lets a contributor edit but not delete', async () => {
    renderDetail({ role: 'contributor' })
    await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

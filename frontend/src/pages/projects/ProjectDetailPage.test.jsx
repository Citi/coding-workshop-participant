import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { projectsApi } from '../../services/projectsApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { APOLLO, makeProject } from './projectFixtures'
import ProjectDetailPage from './ProjectDetailPage'

vi.mock('../../services/projectsApi', () => ({
  projectsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

// Panels owned by other groups: show the props they receive and let the test trigger onChange.
vi.mock('../deliverables/DeliverablesPanel', () => ({
  default: ({ projectId, onChange }) => (
    <button type="button" onClick={onChange}>
      Deliverables panel for project {projectId}
    </button>
  ),
}))
vi.mock('../resources/AllocationsPanel', () => ({
  default: ({ projectId, onChange }) => (
    <button type="button" onClick={onChange}>
      Team panel for project {projectId}
    </button>
  ),
}))
vi.mock('../budget/ExpensesPanel', () => ({
  default: ({ projectId, onChange }) => (
    <button type="button" onClick={onChange}>
      Expenses panel for project {projectId}
    </button>
  ),
}))

function renderDetail({ role = 'admin', route = '/projects/1' } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<ProjectDetailPage />, {
    role,
    route,
    path: '/projects/:projectId',
    extraRoutes: [{ path: '/projects', element: <p>Projects list page</p> }],
  })
  return { user }
}

const findTitle = (name = 'Apollo CRM') => screen.findByRole('heading', { level: 1, name })
const findErrorAlert = async (title) => (await screen.findByText(title)).closest('[role="alert"]')

beforeEach(() => {
  vi.resetAllMocks()
  mobile.value = false
  projectsApi.get.mockResolvedValue(APOLLO)
})

describe('ProjectDetailPage', () => {
  it('loads the project and shows its header, status, health and overview', async () => {
    renderDetail()
    expect(screen.getByRole('status')).toHaveTextContent('Loading project')
    await findTitle()
    expect(projectsApi.get).toHaveBeenCalledWith(1)

    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Status:').parentElement).toHaveTextContent('Status: Active')
    expect(screen.getByText('Health:').parentElement).toHaveTextContent('Health: At risk')
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/projects')
    expect(screen.getByText('Health: At risk')).toBeInTheDocument()
    expect(screen.getByText('2 of 5 deliverables complete')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByText('$61,000.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('switches between the deliverables, team and budget tabs', async () => {
    const { user } = renderDetail()
    await findTitle()
    const tablist = screen.getByRole('tablist', { name: 'Project sections' })
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Deliverables', 'Team', 'Budget'])
    expect(screen.getByRole('tab', { name: 'Deliverables' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Team' })).not.toHaveClass('MuiTab-fullWidth')
    expect(screen.getByRole('tabpanel', { name: 'Deliverables' })).toHaveTextContent('Deliverables panel for project 1')

    await user.click(screen.getByRole('tab', { name: 'Team' }))
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Team' })).toHaveTextContent('Team panel for project 1')
    expect(screen.queryByText(/Deliverables panel/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Budget' }))
    expect(screen.getByRole('tabpanel', { name: 'Budget' })).toHaveTextContent('Expenses panel for project 1')
  })

  it('refreshes the project metrics when a panel changes data, keeping the panel open', async () => {
    let finishRefresh
    projectsApi.get
      .mockResolvedValueOnce(APOLLO)
      .mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    const { user } = renderDetail()
    await findTitle()
    await user.click(screen.getByRole('tab', { name: 'Team' }))
    await user.click(screen.getByRole('button', { name: 'Team panel for project 1' }))

    expect(await screen.findByRole('progressbar', { name: 'Refreshing project' })).toBeInTheDocument()
    finishRefresh(makeProject({ deliverables_completed: 3, progress_percent: 60 }))
    expect(await screen.findByText('3 of 5 deliverables complete')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Refreshing project' })).not.toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Team' })).toHaveTextContent('Team panel for project 1')
    expect(projectsApi.get).toHaveBeenCalledTimes(2)
  })

  it('keeps showing the project when a refresh fails, with a Retry', async () => {
    projectsApi.get
      .mockResolvedValueOnce(APOLLO)
      .mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server.' }))
    const { user } = renderDetail()
    await findTitle()
    await user.click(screen.getByRole('button', { name: 'Deliverables panel for project 1' }))
    expect(await findErrorAlert(/Could not refresh the project/)).toHaveTextContent('Cannot reach the server.')
    expect(screen.getByRole('heading', { level: 1, name: 'Apollo CRM' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText(/Could not refresh the project/)).not.toBeInTheDocument())
    expect(projectsApi.get).toHaveBeenCalledTimes(3)
  })

  it('shows a friendly message with a way back when the project does not exist', async () => {
    projectsApi.get.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Project not found' }))
    const { user } = renderDetail({ route: '/projects/99' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Project not found' })).toBeInTheDocument()
    expect(projectsApi.get).toHaveBeenCalledWith(99)
    await user.click(screen.getByRole('link', { name: 'Back to projects' }))
    expect(await screen.findByText('Projects list page')).toBeInTheDocument()
  })

  it('treats an id that is not a positive number as not found, without calling the API', () => {
    renderDetail({ route: '/projects/abc' })
    expect(screen.getByText('Project not found')).toBeInTheDocument()
    expect(projectsApi.get).not.toHaveBeenCalled()
  })

  it('treats an id beyond the API integer range as not found (the API would answer 400, not 404)', () => {
    renderDetail({ route: '/projects/2147483648' })
    expect(screen.getByText('Project not found')).toBeInTheDocument()
    expect(projectsApi.get).not.toHaveBeenCalled()
  })

  it('shows the load error with a Retry button and a link back', async () => {
    projectsApi.get.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error' }))
    const { user } = renderDetail()
    expect(await findErrorAlert(/Could not load the project/)).toHaveTextContent('Unexpected server error')
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/projects')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findTitle()).toBeInTheDocument()
  })

  it('edits the project and shows the updated details', async () => {
    const renamed = makeProject({ name: 'Apollo CRM 2' })
    projectsApi.update.mockResolvedValue(renamed)
    projectsApi.get.mockResolvedValueOnce(APOLLO).mockResolvedValueOnce(renamed)
    const { user } = renderDetail()
    await findTitle()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit project' })
    const name = within(dialog).getByLabelText(/Name/)
    await user.clear(name)
    await user.type(name, 'Apollo CRM 2')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(projectsApi.update).toHaveBeenCalledWith(1, {
        name: 'Apollo CRM 2',
        description: 'Replace the legacy CRM',
        department: 'Sales',
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        budget: 150000,
      }),
    )
    expect(await screen.findByText('Project updated')).toBeInTheDocument()
    expect(await findTitle('Apollo CRM 2')).toBeInTheDocument()
  })

  it('deletes the project after confirmation and returns to the list', async () => {
    projectsApi.remove.mockResolvedValue(null)
    const { user } = renderDetail()
    await findTitle()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' })
    expect(dialog).toHaveTextContent(
      '"Apollo CRM" will be permanently deleted, together with its 5 deliverables (and their dependency links), 3 team allocations and all of its expenses.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    await waitFor(() => expect(projectsApi.remove).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Projects list page')).toBeInTheDocument()
    expect(screen.getByText('Project deleted')).toBeInTheDocument()
  })

  it('shows viewers no edit or delete actions', async () => {
    renderDetail({ role: 'viewer' })
    await findTitle()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('lets contributors edit but not delete', async () => {
    renderDetail({ role: 'contributor' })
    await findTitle()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows no health chip for a closed project', async () => {
    projectsApi.get.mockResolvedValue(makeProject({ status: 'completed', health: null, health_reasons: [] }))
    renderDetail()
    await findTitle()
    expect(screen.getByText('Status:').parentElement).toHaveTextContent('Status: Completed')
    expect(screen.queryByText('Health:')).not.toBeInTheDocument()
  })

  it('uses full-width tabs on mobile', async () => {
    mobile.value = true
    renderDetail()
    await findTitle()
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveClass('MuiTab-fullWidth')
  })
})

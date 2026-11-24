import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { projectsApi } from '../../services/projectsApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { todayIso } from '../../utils/format'
import { APOLLO, listOf, ZEUS } from './projectFixtures'
import ProjectsPage from './ProjectsPage'

vi.mock('../../services/projectsApi', () => ({
  projectsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

function DetailRoute() {
  const { projectId } = useParams()
  return <p>Detail of project {projectId}</p>
}

function renderPage(role = 'admin') {
  const user = userEvent.setup()
  renderWithProviders(<ProjectsPage />, {
    role,
    route: '/projects',
    path: '/projects',
    extraRoutes: [{ path: '/projects/:projectId', element: <DetailRoute /> }],
  })
  return { user }
}

const findTable = () => screen.findByRole('table', { name: 'Projects' })
const rowOf = (name) => screen.getByText(name).closest('tr')
const searchBox = () => screen.getByRole('textbox', { name: 'Search' })

/** Pick an option in an MUI select and wait for its menu to close. */
async function choose(user, label, option, container = document.body) {
  await user.click(within(container).getByRole('combobox', { name: label }))
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', { name: option }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

async function openCreateDialog(user) {
  await findTable()
  await user.click(screen.getByRole('button', { name: 'New project' }))
  return screen.getByRole('dialog', { name: 'New project' })
}

async function retype(user, input, text) {
  await user.clear(input)
  await user.type(input, text)
}

beforeEach(() => {
  vi.resetAllMocks()
  mobile.value = false
  projectsApi.list.mockResolvedValue(listOf(APOLLO, ZEUS))
})

describe('ProjectsPage', () => {
  it('shows a loading state, then each project with its status, health, progress and budget', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    await findTable()
    expect(projectsApi.list).toHaveBeenCalledWith({})
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Project', 'Status', 'Health', 'Progress', 'End date', 'Budget used', 'Team size', 'Actions',
    ])

    const apollo = rowOf('Apollo CRM')
    // MUI v9 Typography only colours palette keys (textSecondary), not paths like 'text.secondary'.
    expect(getComputedStyle(within(apollo).getByText('Sales')).color).toBe('rgba(0, 0, 0, 0.6)')
    expect(within(apollo).getByText('Active')).toBeInTheDocument()
    expect(within(apollo).getByText('At risk')).toBeInTheDocument()
    expect(within(apollo).getByRole('progressbar', { name: '40%' })).toBeInTheDocument()
    expect(within(apollo).getByText('Dec 31, 2026')).toBeInTheDocument()
    expect(within(apollo).getByRole('progressbar', { name: '40.7%' })).toHaveClass('MuiLinearProgress-colorPrimary')
    expect(within(apollo).getByText('$61,000 of $150,000')).toBeInTheDocument()
    expect(within(apollo).getAllByRole('cell')[6]).toHaveTextContent('3')

    const zeus = rowOf('Zeus Portal')
    expect(within(zeus).getByText('Completed')).toBeInTheDocument()
    expect(within(zeus).getAllByRole('cell')[2]).toHaveTextContent('—')
    expect(within(zeus).getByRole('progressbar', { name: 'No budget' })).toHaveClass('MuiLinearProgress-colorError')
  })

  it('shows why a project is at risk in a tooltip', async () => {
    const { user } = renderPage()
    await findTable()
    await user.hover(within(rowOf('Apollo CRM')).getByText('At risk'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('1 deliverable(s) overdue')
  })

  it('opens the project page when a row is clicked', async () => {
    const { user } = renderPage()
    await findTable()
    await user.click(screen.getByText('Zeus Portal'))
    expect(await screen.findByText('Detail of project 2')).toBeInTheDocument()
  })

  it('sends the search text and filters to the API as query parameters', async () => {
    const { user } = renderPage()
    await findTable()
    await user.type(searchBox(), 'crm')
    await waitFor(() => expect(projectsApi.list).toHaveBeenLastCalledWith({ search: 'crm' }))
    await choose(user, 'Status', 'Active')
    await waitFor(() => expect(projectsApi.list).toHaveBeenLastCalledWith({ search: 'crm', status: 'active' }))
    await choose(user, 'Health', 'At risk')
    await waitFor(() =>
      expect(projectsApi.list).toHaveBeenLastCalledWith({ search: 'crm', status: 'active', health: 'at_risk' }),
    )
  })

  it('offers the departments of the loaded projects and keeps them while filtering', async () => {
    const { user } = renderPage()
    await findTable()
    const optionTexts = async () => {
      await user.click(screen.getByRole('combobox', { name: 'Department' }))
      const listbox = await screen.findByRole('listbox')
      return within(listbox).getAllByRole('option').map((option) => option.textContent)
    }
    expect(await optionTexts()).toEqual(['All', 'IT', 'Sales'])

    projectsApi.list.mockResolvedValue(listOf(APOLLO))
    await user.click(screen.getByRole('option', { name: 'Sales' }))
    await waitFor(() => expect(projectsApi.list).toHaveBeenLastCalledWith({ department: 'Sales' }))
    await waitFor(() => expect(screen.queryByText('Zeus Portal')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    expect(await optionTexts()).toEqual(['All', 'IT', 'Sales'])
  })

  it('creates a project after validating the form', async () => {
    projectsApi.create.mockResolvedValue({ ...APOLLO, id: 3, name: 'Hermes' })
    const { user } = renderPage()
    const dialog = await openCreateDialog(user)
    expect(within(dialog).getByRole('combobox', { name: /Status/ })).toHaveTextContent('Planned')
    expect(within(dialog).getByLabelText(/Start date/)).toHaveValue(todayIso())

    await user.click(within(dialog).getByRole('button', { name: 'Create project' }))
    expect(within(dialog).getByText('Please fix the highlighted fields.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('This field is required')).toHaveLength(3)

    await user.type(within(dialog).getByLabelText(/Name/), 'Hermes')
    await user.type(within(dialog).getByLabelText(/Department/), 'Finance')
    await retype(user, within(dialog).getByLabelText(/Start date/), '2026-05-10')
    await user.type(within(dialog).getByLabelText(/End date/), '2026-05-01')
    await user.type(within(dialog).getByLabelText(/Budget/), '10.123')
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }))
    expect(within(dialog).getByText('Must be on or after the start date')).toBeInTheDocument()
    expect(within(dialog).getByText('Use at most 2 decimal places')).toBeInTheDocument()

    await retype(user, within(dialog).getByLabelText(/Budget/), '-5')
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }))
    expect(within(dialog).getByText('Must be at least 0')).toBeInTheDocument()
    expect(projectsApi.create).not.toHaveBeenCalled()

    await retype(user, within(dialog).getByLabelText(/End date/), '2026-11-30')
    await retype(user, within(dialog).getByLabelText(/Budget/), '25000.5')
    await user.type(within(dialog).getByLabelText(/Description/), 'Payments platform')
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }))

    await waitFor(() =>
      expect(projectsApi.create).toHaveBeenCalledWith({
        name: 'Hermes',
        description: 'Payments platform',
        department: 'Finance',
        status: 'planned',
        start_date: '2026-05-10',
        end_date: '2026-11-30',
        budget: 25000.5,
      }),
    )
    expect(await screen.findByText('Project created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(projectsApi.list).toHaveBeenCalledTimes(2))
  })

  it('sends a budget of 0 when the budget is left empty', async () => {
    projectsApi.create.mockResolvedValue({ ...APOLLO, id: 3 })
    const { user } = renderPage()
    const dialog = await openCreateDialog(user)
    await user.type(within(dialog).getByLabelText(/Name/), 'Hermes')
    await user.type(within(dialog).getByLabelText(/Department/), 'Finance')
    await user.type(within(dialog).getByLabelText(/End date/), '2099-12-31')
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(projectsApi.create).toHaveBeenCalledTimes(1))
    expect(projectsApi.create.mock.calls[0][0]).toMatchObject({ budget: 0, description: '', start_date: todayIso() })
  })

  it('shows server validation errors next to the matching field', async () => {
    const message = 'A project with this name already exists'
    projectsApi.create.mockRejectedValue(new ApiError({ status: 409, code: 'CONFLICT', message, details: { name: message } }))
    const { user } = renderPage()
    const dialog = await openCreateDialog(user)
    await user.type(within(dialog).getByLabelText(/Name/), 'Apollo CRM')
    await user.type(within(dialog).getByLabelText(/Department/), 'Sales')
    await user.type(within(dialog).getByLabelText(/End date/), '2099-12-31')
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    const name = within(dialog).getByLabelText(/Name/)
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(message)
    expect(within(dialog).getByRole('button', { name: 'Create project' })).toBeEnabled()
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
  })

  it('edits a project with a full update', async () => {
    projectsApi.update.mockResolvedValue({ ...APOLLO, status: 'on_hold', budget: 175000 })
    const { user } = renderPage()
    await findTable()
    await user.click(screen.getByRole('button', { name: 'Edit Apollo CRM' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit project' })
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('Apollo CRM')
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue('Replace the legacy CRM')
    expect(within(dialog).getByLabelText(/Budget/)).toHaveValue(150000)

    await choose(user, /Status/, 'On hold', dialog)
    await retype(user, within(dialog).getByLabelText(/Budget/), '175000')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(projectsApi.update).toHaveBeenCalledWith(1, {
        name: 'Apollo CRM',
        description: 'Replace the legacy CRM',
        department: 'Sales',
        status: 'on_hold',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        budget: 175000,
      }),
    )
    expect(await screen.findByText('Project updated')).toBeInTheDocument()
    await waitFor(() => expect(projectsApi.list).toHaveBeenCalledTimes(2))
  })

  it('deletes a project after a confirmation that explains what else is removed', async () => {
    projectsApi.remove.mockResolvedValue(null)
    const { user } = renderPage()
    await findTable()
    await user.click(screen.getByRole('button', { name: 'Delete Apollo CRM' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' })
    expect(dialog).toHaveTextContent('5 deliverables (and their dependency links), 3 team allocations and all of its expenses')

    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    await waitFor(() => expect(projectsApi.remove).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Project deleted')).toBeInTheDocument()
    await waitFor(() => expect(projectsApi.list).toHaveBeenCalledTimes(2))
  })

  it('keeps the confirmation open with the error when a delete fails', async () => {
    const message = 'Your role does not allow this action'
    projectsApi.remove.mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN', message }))
    const { user } = renderPage()
    await findTable()
    await user.click(screen.getByRole('button', { name: 'Delete Zeus Portal' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
  })

  it('shows viewers no create, edit or delete controls', async () => {
    renderPage('viewer')
    await findTable()
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('lets contributors create and edit, but not delete', async () => {
    renderPage('contributor')
    await findTable()
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Apollo CRM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })

  it('shows the error with a Retry button when loading fails', async () => {
    projectsApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The database is unavailable' }))
    const { user } = renderPage()
    expect(await screen.findByText(/The database is unavailable/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findTable()).toBeInTheDocument()
    expect(projectsApi.list).toHaveBeenCalledTimes(2)
  })

  it('invites users who can create to add the first project', async () => {
    projectsApi.list.mockResolvedValue(listOf())
    const { user } = renderPage()
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    expect(screen.getByText('Create the first project to start tracking its progress.')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'New project' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1])
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
  })

  it('tells viewers when there are no projects or none match the filters', async () => {
    projectsApi.list.mockResolvedValue(listOf())
    const { user } = renderPage('viewer')
    expect(await screen.findByText('Projects will appear here once they are created.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()

    await user.type(searchBox(), 'nothing')
    expect(await screen.findByText('No matching projects')).toBeInTheDocument()
    expect(screen.getByText(/Try changing or clearing them/)).toBeInTheDocument()
  })

  it('shows projects as cards on mobile, without the team column or tooltips', async () => {
    mobile.value = true
    renderPage()
    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(cards[0]).getByText('Health')).toBeInTheDocument()
    expect(within(cards[0]).queryByText('Team size')).not.toBeInTheDocument()
    expect(within(cards[0]).getByText('At risk').closest('span[tabindex]')).toBeNull()
  })
})

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { projectsApi } from '../../services/projectsApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { todayIso } from '../../utils/format'
import { APOLLO, listOf, makeProject, ZEUS } from './projectFixtures'
import ProjectsPage from './ProjectsPage'

vi.mock('../../services/projectsApi', () => ({
  projectsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

function DetailRoute() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  return (
    <>
      <p>Detail of project {projectId}</p>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  )
}

/** The address bar: path and query string of the current location. */
function UrlProbe() {
  const location = useLocation()
  return <p data-testid="url">{`${location.pathname}${location.search}`}</p>
}

function renderPage(role = 'admin', route = '/projects') {
  const user = userEvent.setup()
  renderWithProviders(
    <>
      <Link to="/projects">Projects menu item</Link>
      <ProjectsPage />
      <UrlProbe />
    </>,
    {
      role,
      route,
      path: '/projects',
      extraRoutes: [{ path: '/projects/:projectId', element: <DetailRoute /> }],
    },
  )
  return { user }
}

const currentUrl = () => screen.getByTestId('url').textContent

const findTable = () => screen.findByRole('table', { name: 'Projects' })
const rowOf = (name) => screen.getByText(name).closest('tr')
const searchBox = () => screen.getByRole('textbox', { name: 'Search' })
const viewButton = (name) => within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name })
const findTimeline = () => screen.findByRole('list', { name: 'Project timeline' })
const queryTimeline = () => screen.queryByRole('list', { name: 'Project timeline' })
/** The projects on the timeline, in order: each row's link shows its project's name. */
const timelineNames = () =>
  within(screen.getByRole('list', { name: 'Project timeline' }))
    .getAllByRole('listitem')
    .map((row) => within(row).getByRole('link').textContent)

/** A response the test sends itself, to look at the screen while the request is still running. */
function deferred() {
  let resolve
  const promise = new Promise((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

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

  it('fits a narrow table without breaking names mid-word: whole words, compact bars', async () => {
    renderPage()
    await findTable()
    const apollo = rowOf('Apollo CRM')
    // overflow-wrap (unlike word-break: break-word) keeps the column as wide as the longest word.
    const name = within(apollo).getByText('Apollo CRM')
    expect(name).toHaveStyle({ overflowWrap: 'break-word' })
    expect(name).not.toHaveStyle({ wordBreak: 'break-word' })
    // Both bars of a row need 96px rather than 120px.
    for (const bar of within(apollo).getAllByRole('progressbar')) expect(bar.parentElement).toHaveStyle({ minWidth: '96px' })
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
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the projects. The database is unavailable')
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

describe('ProjectsPage filters in the URL', () => {
  it('starts from the filters in the link, including the combined health filter', async () => {
    renderPage('admin', '/projects?search=crm&status=active&health=at_risk,overdue&department=Sales&view=timeline')
    await findTimeline()
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
    expect(projectsApi.list).toHaveBeenCalledWith({ search: 'crm', status: 'active', health: 'at_risk,overdue', department: 'Sales' })
    expect(searchBox()).toHaveValue('crm')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Active')
    expect(screen.getByRole('combobox', { name: 'Health' })).toHaveTextContent('At risk or overdue')
    expect(screen.getByRole('combobox', { name: 'Department' })).toHaveTextContent('Sales')
  })

  /** The texts of a select's options, read from its open menu (closed again afterwards). */
  async function optionTexts(user, label) {
    await user.click(screen.getByRole('combobox', { name: label }))
    const listbox = await screen.findByRole('listbox')
    const texts = within(listbox).getAllByRole('option').map((option) => option.textContent)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    return texts
  }

  it('shows a department from the link under its own name, also when none of its projects loaded', async () => {
    projectsApi.list.mockResolvedValue(listOf())
    const { user } = renderPage('admin', '/projects?department=Finance')
    expect(await screen.findByText('No matching projects')).toBeInTheDocument()
    expect(projectsApi.list).toHaveBeenCalledWith({ department: 'Finance' })
    expect(screen.getByRole('combobox', { name: 'Department' })).toHaveTextContent(/^Finance$/)
    expect(await optionTexts(user, 'Department')).toEqual(['All', 'Finance'])
  })

  it('selects the loaded department that the link spells in another case, without a second entry', async () => {
    // The API matches departments case-insensitively: ?department=sales lists the Sales projects.
    projectsApi.list.mockResolvedValue(listOf(APOLLO))
    const { user } = renderPage('admin', '/projects?department=sales')
    await findTable()
    expect(projectsApi.list).toHaveBeenCalledWith({ department: 'sales' })
    expect(screen.getByRole('combobox', { name: 'Department' })).toHaveTextContent(/^Sales$/)
    expect(await optionTexts(user, 'Department')).toEqual(['All', 'Sales'])

    projectsApi.list.mockResolvedValue(listOf(APOLLO, ZEUS))
    await choose(user, 'Department', 'All')
    expect(currentUrl()).toBe('/projects')
    expect(await optionTexts(user, 'Department')).toEqual(['All', 'IT', 'Sales'])
  })

  it.each([
    ['/projects?status=done&health=sick&department=%20&search=%20', {}],
    ['/projects?health=overdue,at_risk', { health: 'at_risk,overdue' }],
    ['/projects?health=at_risk,bogus&status=on_hold', { status: 'on_hold' }],
    [`/projects?search=${'x'.repeat(201)}&department=${'d'.repeat(101)}`, {}],
  ])('ignores invalid values in the link %s', async (route, query) => {
    renderPage('admin', route)
    await findTable()
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
    expect(projectsApi.list).toHaveBeenCalledWith(query)
  })

  it('writes every filter change to the address bar, keeping other parameters such as the view', async () => {
    const { user } = renderPage('admin', '/projects?view=timeline')
    await findTimeline()
    await choose(user, 'Status', 'Active')
    expect(currentUrl()).toBe('/projects?view=timeline&status=active')
    await choose(user, 'Health', 'At risk or overdue')
    expect(currentUrl()).toBe('/projects?view=timeline&status=active&health=at_risk%2Coverdue')
    await waitFor(() => expect(projectsApi.list).toHaveBeenLastCalledWith({ status: 'active', health: 'at_risk,overdue' }))

    await user.type(searchBox(), 'crm')
    await waitFor(() => expect(currentUrl()).toBe('/projects?view=timeline&status=active&health=at_risk%2Coverdue&search=crm'))
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(currentUrl()).toBe('/projects?view=timeline')
    await waitFor(() => expect(projectsApi.list).toHaveBeenLastCalledWith({}))
  })

  it('keeps the focus and the list while typing in the search box', async () => {
    const { user } = renderPage()
    const table = await findTable()
    const box = searchBox()
    await user.type(box, 'crm')
    await waitFor(() => expect(currentUrl()).toBe('/projects?search=crm'))
    await waitFor(() => expect(projectsApi.list).toHaveBeenLastCalledWith({ search: 'crm' }))
    expect(searchBox()).toBe(box)
    expect(box).toHaveFocus()
    expect(box).toHaveValue('crm')
    expect(screen.getByRole('table', { name: 'Projects' })).toBe(table)
  })

  it('keeps the filters when coming back from a project page', async () => {
    const { user } = renderPage('admin', '/projects?status=active')
    await findTable()
    await choose(user, 'Health', 'At risk')
    await user.type(searchBox(), 'apo')
    await waitFor(() => expect(currentUrl()).toBe('/projects?status=active&health=at_risk&search=apo'))

    await user.click(screen.getByText('Apollo CRM'))
    expect(await screen.findByText('Detail of project 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))

    await findTable()
    expect(currentUrl()).toBe('/projects?status=active&health=at_risk&search=apo')
    expect(projectsApi.list).toHaveBeenLastCalledWith({ search: 'apo', status: 'active', health: 'at_risk' })
    expect(searchBox()).toHaveValue('apo')
    expect(screen.getByRole('combobox', { name: 'Health' })).toHaveTextContent('At risk')
  })

  it('follows a new link (e.g. the menu item), resetting the filters and the search box', async () => {
    const { user } = renderPage('admin', '/projects?search=crm&status=active')
    await findTable()
    expect(searchBox()).toHaveValue('crm')
    await user.click(screen.getByRole('link', { name: 'Projects menu item' }))
    await waitFor(() => expect(projectsApi.list).toHaveBeenLastCalledWith({}))
    expect(currentUrl()).toBe('/projects')
    expect(searchBox()).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Status' })).not.toHaveTextContent('Active')
  })
})

describe('ProjectsPage List | Timeline views', () => {
  const HERMES = makeProject({
    id: 3, name: 'Hermes Payments', department: 'Finance', health: 'overdue', start_date: '2026-02-01', end_date: '2026-06-30',
  })
  const ORION = makeProject({
    id: 4, name: 'Orion Analytics', department: 'IT', status: 'planned', health: 'on_track', start_date: '2026-09-01', end_date: '2027-03-31',
  })
  const ALL_NAMES = ['Apollo CRM', 'Zeus Portal', 'Hermes Payments', 'Orion Analytics']
  const databaseDown = () => new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The database is unavailable' })
  /** The projects GET /projects knows about; a create adds one. */
  let projects

  /** GET /projects as the API answers it: the projects matching the filters. */
  function matching({ search, status, health, department } = {}) {
    return projects.filter(
      (project) =>
        (!search || project.name.toLowerCase().includes(search.toLowerCase())) &&
        (!status || project.status === status) &&
        (!health || health.split(',').includes(project.health)) &&
        (!department || project.department === department),
    )
  }

  beforeEach(() => {
    projects = [APOLLO, ZEUS, HERMES, ORION]
    projectsApi.list.mockImplementation(async (filters) => listOf(...matching(filters)))
  })

  it('shows the list by default, with "List" pressed', async () => {
    renderPage()
    await findTable()
    expect(viewButton('List')).toHaveAttribute('aria-pressed', 'true')
    expect(viewButton('Timeline')).toHaveAttribute('aria-pressed', 'false')
    expect(queryTimeline()).not.toBeInTheDocument()
  })

  it('switches to the timeline, keeping the filters in the URL and the projects already loaded', async () => {
    const { user } = renderPage('admin', '/projects?department=IT')
    await findTable()
    await user.click(viewButton('Timeline'))

    expect(currentUrl()).toBe('/projects?department=IT&view=timeline')
    await findTimeline()
    expect(timelineNames()).toEqual(['Zeus Portal', 'Orion Analytics'])
    expect(screen.getByRole('link', { name: /^Orion Analytics: Sep 1, 2026 – Mar 31, 2027 · On track/ })).toHaveAttribute(
      'href',
      '/projects/4',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(viewButton('Timeline')).toHaveAttribute('aria-pressed', 'true')
    expect(viewButton('List')).toHaveAttribute('aria-pressed', 'false')
    // Both views show the same filtered list: switching does not load it again.
    expect(projectsApi.list.mock.calls).toEqual([[{ department: 'IT' }]])
    expect(screen.getByRole('combobox', { name: 'Department' })).toHaveTextContent('IT')
  })

  it('opens the timeline from a link with its filters (#/projects?view=timeline&health=at_risk,overdue)', async () => {
    renderPage('admin', '/projects?view=timeline&health=at_risk,overdue')
    await findTimeline()
    expect(projectsApi.list.mock.calls).toEqual([[{ health: 'at_risk,overdue' }]])
    expect(timelineNames()).toEqual(['Apollo CRM', 'Hermes Payments'])
    expect(viewButton('Timeline')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Health' })).toHaveTextContent('At risk or overdue')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('switches back to the list, removing the view from the URL and keeping the filters', async () => {
    const { user } = renderPage('admin', '/projects?view=timeline&health=at_risk,overdue')
    await findTimeline()
    await user.click(viewButton('List'))

    expect(currentUrl()).toBe('/projects?health=at_risk%2Coverdue')
    const table = await findTable()
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByText('Hermes Payments')).toBeInTheDocument()
    expect(queryTimeline()).not.toBeInTheDocument()
    expect(viewButton('List')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Health' })).toHaveTextContent('At risk or overdue')
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
  })

  it('falls back to the list for an unknown view', async () => {
    renderPage('admin', '/projects?view=gantt')
    await findTable()
    expect(viewButton('List')).toHaveAttribute('aria-pressed', 'true')
    expect(viewButton('Timeline')).toHaveAttribute('aria-pressed', 'false')
    expect(queryTimeline()).not.toBeInTheDocument()
  })

  it('shows a loading state in the timeline view until the projects arrive', async () => {
    renderPage('admin', '/projects?view=timeline')
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(queryTimeline()).not.toBeInTheDocument()
    await findTimeline()
    expect(timelineNames()).toEqual(ALL_NAMES)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('shows the error with a Retry button in the timeline view when loading fails', async () => {
    projectsApi.list.mockRejectedValueOnce(databaseDown())
    const { user } = renderPage('admin', '/projects?view=timeline')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the projects. The database is unavailable')
    expect(queryTimeline()).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await findTimeline()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(projectsApi.list).toHaveBeenCalledTimes(2)
  })

  it('keeps the timeline on screen, with a "Refreshing" bar or the error, while new filters load', async () => {
    const { user } = renderPage('admin', '/projects?view=timeline')
    await findTimeline()
    const response = deferred()
    projectsApi.list.mockReturnValueOnce(response.promise)
    await choose(user, 'Health', 'Overdue')
    expect(await screen.findByRole('progressbar', { name: 'Refreshing' })).toBeInTheDocument()
    expect(timelineNames()).toEqual(ALL_NAMES)

    await act(async () => response.resolve(listOf(HERMES)))
    await waitFor(() => expect(timelineNames()).toEqual(['Hermes Payments']))
    expect(screen.queryByRole('progressbar', { name: 'Refreshing' })).not.toBeInTheDocument()

    projectsApi.list.mockRejectedValueOnce(databaseDown())
    await choose(user, 'Health', 'At risk')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh the projects. The database is unavailable')
    expect(timelineNames()).toEqual(['Hermes Payments'])
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(timelineNames()).toEqual(['Apollo CRM']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(projectsApi.list).toHaveBeenLastCalledWith({ health: 'at_risk' })
  })

  it('shows the empty state of the list, with its create action, in the timeline view', async () => {
    projects = []
    const { user } = renderPage('admin', '/projects?view=timeline')
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    expect(screen.getByText('Create the first project to start tracking its progress.')).toBeInTheDocument()
    expect(queryTimeline()).not.toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'New project' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1])
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
  })

  it('explains an empty filtered timeline, without the create action', async () => {
    renderPage('admin', '/projects?view=timeline&status=on_hold')
    expect(await screen.findByText('No matching projects')).toBeInTheDocument()
    expect(screen.getByText('No project matches these filters. Try changing or clearing them.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New project' })).toHaveLength(1)
  })

  it('tells viewers in the timeline view that projects appear once created', async () => {
    projects = []
    renderPage('viewer', '/projects?view=timeline')
    expect(await screen.findByText('Projects will appear here once they are created.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
  })

  it('adds a project created from the timeline view to the timeline', async () => {
    projectsApi.create.mockImplementation(async (payload) => {
      const created = makeProject({ ...payload, id: 5, health: 'on_track', progress_percent: 0 })
      projects = [...projects, created]
      return created
    })
    const { user } = renderPage('admin', '/projects?view=timeline')
    await findTimeline()
    await user.click(screen.getByRole('button', { name: 'New project' }))
    const dialog = screen.getByRole('dialog', { name: 'New project' })
    await user.type(within(dialog).getByLabelText(/Name/), 'Atlas Rollout')
    await user.type(within(dialog).getByLabelText(/Department/), 'Ops')
    await user.type(within(dialog).getByLabelText(/End date/), '2027-06-30')
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }))

    expect(await screen.findByText('Project created')).toBeInTheDocument()
    await waitFor(() => expect(timelineNames()).toEqual([...ALL_NAMES, 'Atlas Rollout']))
    expect(projectsApi.list).toHaveBeenCalledTimes(2)
    expect(viewButton('Timeline')).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers the timeline to viewers and on phones', async () => {
    mobile.value = true
    const { user } = renderPage('viewer')
    expect(await screen.findAllByRole('listitem')).toHaveLength(ALL_NAMES.length)
    await user.click(viewButton('Timeline'))
    await findTimeline()
    expect(timelineNames()).toEqual(ALL_NAMES)
    expect(currentUrl()).toBe('/projects?view=timeline')
  })
})

describe('ProjectsPage sorting', () => {
  const HERMES = makeProject({
    id: 3, name: 'Hermes Payments', department: 'Finance', health: 'overdue', end_date: '2026-06-30', team_size: 5, budget_used_percent: 95,
  })
  const NAMES = ['Apollo CRM', 'Zeus Portal', 'Hermes Payments']
  const order = () => screen.getAllByRole('row').slice(1).map((row) => NAMES.find((name) => row.textContent.includes(name)))
  const sortBy = (user, header) => user.click(screen.getByRole('button', { name: header }))

  it('sorts health by severity, and other columns by their values, from the header', async () => {
    projectsApi.list.mockResolvedValue(listOf(APOLLO, ZEUS, HERMES))
    const { user } = renderPage()
    await findTable()
    expect(order()).toEqual(['Apollo CRM', 'Zeus Portal', 'Hermes Payments'])

    // Most severe first; Zeus is completed, so it has no health and stays last.
    await sortBy(user, 'Health')
    expect(order()).toEqual(['Hermes Payments', 'Apollo CRM', 'Zeus Portal'])
    expect(screen.getByRole('columnheader', { name: 'Health' })).toHaveAttribute('aria-sort', 'ascending')
    await sortBy(user, 'Health')
    expect(order()).toEqual(['Apollo CRM', 'Hermes Payments', 'Zeus Portal'])
    expect(screen.getByRole('columnheader', { name: 'Health' })).toHaveAttribute('aria-sort', 'descending')

    await sortBy(user, 'End date')
    expect(order()).toEqual(['Zeus Portal', 'Hermes Payments', 'Apollo CRM'])
    expect(screen.getByRole('columnheader', { name: 'Health' })).not.toHaveAttribute('aria-sort')

    // No budget but money spent (null) is the highest share used.
    await sortBy(user, 'Budget used')
    expect(order()).toEqual(['Apollo CRM', 'Hermes Payments', 'Zeus Portal'])
    await sortBy(user, 'Team size')
    expect(order()).toEqual(['Zeus Portal', 'Apollo CRM', 'Hermes Payments'])
    await sortBy(user, 'Status')
    expect(order()).toEqual(['Apollo CRM', 'Hermes Payments', 'Zeus Portal'])
    await sortBy(user, 'Status')
    await sortBy(user, 'Status')
    expect(order()).toEqual(['Apollo CRM', 'Zeus Portal', 'Hermes Payments'])
  })
})

describe('ProjectsPage end dates', () => {
  const HERMES = makeProject({ id: 3, name: 'Hermes Payments', status: 'on_hold', end_date: '2026-12-20', health: 'overdue' })
  const ORION = makeProject({ id: 4, name: 'Orion Analytics', status: 'cancelled', end_date: '2026-11-30', health: null, health_reasons: [] })
  const NAMES = ['Apollo CRM', 'Zeus Portal', 'Hermes Payments', 'Orion Analytics']
  const order = () => screen.getAllByRole('row').slice(1).map((row) => NAMES.find((name) => row.textContent.includes(name)))
  /** The End date cell of a project's row. */
  const endDateOf = (name) => {
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    return rowOf(name).cells[headers.indexOf('End date')]
  }

  beforeEach(() => {
    // The urgency is worded relative to today (UTC): a fixed Dec 29, 2026. Only Date is faked.
    vi.setSystemTime(new Date('2026-12-29T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says how close each end date is, except for completed and cancelled projects', async () => {
    projectsApi.list.mockResolvedValue(listOf(APOLLO, ZEUS, HERMES, ORION))
    const { user } = renderPage()
    await findTable()
    expect(endDateOf('Apollo CRM')).toHaveTextContent('Dec 31, 2026 Ends in 2 days')
    // On hold still has to finish, so it can be overdue.
    expect(endDateOf('Hermes Payments')).toHaveTextContent('Dec 20, 2026 9 days overdue')
    expect(endDateOf('Zeus Portal')).toHaveTextContent(/^Sep 30, 2025$/)
    expect(endDateOf('Orion Analytics')).toHaveTextContent(/^Nov 30, 2026$/)

    // Sorted by the date itself, not by its wording.
    await user.click(screen.getByRole('button', { name: 'End date' }))
    expect(order()).toEqual(['Zeus Portal', 'Orion Analytics', 'Hermes Payments', 'Apollo CRM'])
    await user.click(screen.getByRole('button', { name: 'End date' }))
    expect(order()).toEqual(['Apollo CRM', 'Hermes Payments', 'Orion Analytics', 'Zeus Portal'])
  })

  it('keeps the end date and its urgency together on the mobile cards', async () => {
    mobile.value = true
    renderPage()
    const [apollo, zeus] = await screen.findAllByRole('listitem')
    expect(within(apollo).getByText('End date').nextElementSibling).toHaveTextContent('Dec 31, 2026 Ends in 2 days')
    expect(within(zeus).getByText('End date').nextElementSibling).toHaveTextContent(/^Sep 30, 2025$/)
  })
})

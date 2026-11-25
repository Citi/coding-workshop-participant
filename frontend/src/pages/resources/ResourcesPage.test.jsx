import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allocationsApi } from '../../services/allocationsApi'
import { ApiError } from '../../services/apiClient'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { MARIA, PRIYA, PRIYA_APOLLO, PRIYA_HERMES, PRIYA_ZEUS, RESOURCES, TOM_APOLLO, list } from './resourceFixtures'
import ResourcesPage from './ResourcesPage'

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))
vi.mock('../../services/resourcesApi', () => ({
  resourcesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../services/allocationsApi', () => ({ allocationsApi: { list: vi.fn() } }))

/** GET /allocations (the heat map's cells): everyone's, sorted by project name, then person. */
const ALL_ALLOCATIONS = [PRIYA_APOLLO, TOM_APOLLO, PRIYA_HERMES, PRIYA_ZEUS]

/** The address bar: path and query string of the current location. */
function UrlProbe() {
  const location = useLocation()
  return <p data-testid="url">{`${location.pathname}${location.search}`}</p>
}

function renderPage({ route = '/resources', role } = {}) {
  renderWithProviders(
    <>
      <Link to="/resources">Resources menu item</Link>
      <ResourcesPage />
      <UrlProbe />
    </>,
    {
      route,
      role,
      path: '/resources',
      extraRoutes: [{ path: '/resources/:resourceId', element: <p>Resource detail page</p> }],
    },
  )
  return userEvent.setup({ delay: null })
}

const rowOf = (name) => screen.getByText(name).closest('tr')
const databaseDown = () => new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' })
const currentUrl = () => screen.getByTestId('url').textContent
const searchBox = () => screen.getByRole('textbox', { name: 'Search' })
const viewButton = (name) => within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name })
const findHeatmap = () => screen.findByRole('region', { name: 'Allocation heat map' })
const queryHeatmap = () => screen.queryByRole('region', { name: 'Allocation heat map' })
/** The people in the heat map, one row each. */
const heatmapNames = () =>
  within(screen.getByRole('region', { name: 'Allocation heat map' }))
    .getAllByRole('rowheader')
    .map((header) => header.textContent)

/** GET /resources as the API answers it: the people matching the filters. */
function matching(people, { search, department, over_allocated: overAllocated } = {}) {
  return people.filter(
    (person) =>
      (!search || person.full_name.toLowerCase().includes(search.toLowerCase())) &&
      (!department || person.department === department) &&
      (!overAllocated || person.is_over_allocated),
  )
}

// Long form flows: extra time so a busy machine (e.g. a coverage run) does not make them flaky.
describe('ResourcesPage', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mobile.value = false
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
    allocationsApi.list.mockResolvedValue(list(ALL_ALLOCATIONS))
  })

  it('shows one card per person on mobile, without the secondary columns', async () => {
    mobile.value = true
    const user = renderPage()
    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(RESOURCES.length)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const priya = cards.find((card) => card.textContent.includes('Priya Shah'))
    expect(priya).toHaveTextContent('Developer')
    expect(within(priya).getByText('Department')).toBeInTheDocument()
    expect(within(priya).getByText('Over-allocated')).toBeInTheDocument()
    expect(within(priya).queryByText('priya@acme.com')).not.toBeInTheDocument()
    expect(within(priya).queryByText('Active projects')).not.toBeInTheDocument()
    expect(within(priya).getByRole('button', { name: 'Delete Priya Shah' })).toBeInTheDocument()
    await user.click(within(priya).getByText('Priya Shah'))
    expect(await screen.findByText('Resource detail page')).toBeInTheDocument()
  })

  it('shows a loading state, then each person with their allocation and over-allocation flag', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    const table = await screen.findByRole('table', { name: 'Resources' })
    expect(within(table).getAllByRole('row')).toHaveLength(RESOURCES.length + 1)
    expect(resourcesApi.list).toHaveBeenCalledWith({})

    const priya = rowOf('Priya Shah')
    expect(within(priya).getByText('Developer')).toBeInTheDocument()
    expect(within(priya).getByText('priya@acme.com')).toBeInTheDocument()
    expect(within(priya).getByText('IT')).toBeInTheDocument()
    expect(within(priya).getByRole('progressbar', { name: '120%' })).toHaveClass('MuiLinearProgress-colorError')
    expect(within(priya).getByText('Over-allocated')).toBeInTheDocument()
    expect(within(priya).getByText('2')).toBeInTheDocument()

    const tom = rowOf('Tom Lee')
    expect(within(tom).getByRole('progressbar', { name: '40%' })).toHaveClass('MuiLinearProgress-colorPrimary')
    expect(within(tom).queryByText('Over-allocated')).not.toBeInTheDocument()

    expect(screen.getByRole('alert')).toHaveTextContent('1 team member is over-allocated (more than 100% across active projects).')
  })

  it('sends the search, department and over-allocation filters as query parameters', async () => {
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByLabelText('Over-allocated only'))
    await waitFor(() => expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: /Department/ }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['All', 'IT', 'Sales'])
    await user.click(screen.getByRole('option', { name: 'Sales' }))
    await waitFor(() => expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true, department: 'Sales' }))

    await user.type(screen.getByLabelText('Search'), 'priya')
    await waitFor(() =>
      expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true, department: 'Sales', search: 'priya' }),
    )

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(resourcesApi.list).toHaveBeenLastCalledWith({}))
  })

  it('preselects the over-allocation filter from the link (?over_allocated=true)', async () => {
    renderPage({ route: '/resources?over_allocated=true' })
    await screen.findByRole('table')
    expect(resourcesApi.list).toHaveBeenCalledWith({ over_allocated: true })
    expect(resourcesApi.list).not.toHaveBeenCalledWith({})
    expect(screen.getByLabelText('Over-allocated only')).toBeChecked()
  })


  it('starts from the department and search in the link', async () => {
    renderPage({ route: '/resources?department=Sales&search=maria&over_allocated=no' })
    await screen.findByRole('table')
    expect(resourcesApi.list).toHaveBeenCalledTimes(1)
    expect(resourcesApi.list).toHaveBeenCalledWith({ department: 'Sales', search: 'maria' })
    expect(screen.getByRole('combobox', { name: /Department/ })).toHaveTextContent('Sales')
    expect(searchBox()).toHaveValue('maria')
  })

  /** The texts of the department select's options, read from its open menu (closed again afterwards). */
  async function departmentOptionTexts(user) {
    await user.click(screen.getByRole('combobox', { name: /Department/ }))
    const listbox = await screen.findByRole('listbox')
    const texts = within(listbox).getAllByRole('option').map((option) => option.textContent)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    return texts
  }

  it('shows a department from the link under its own name, also when nobody in it loaded', async () => {
    resourcesApi.list.mockResolvedValue(list([]))
    const user = renderPage({ route: '/resources?department=Data+%26+Analytics' })
    expect(await screen.findByText('No matching resources')).toBeInTheDocument()
    expect(resourcesApi.list).toHaveBeenCalledWith({ department: 'Data & Analytics' })
    expect(screen.getByRole('combobox', { name: /Department/ })).toHaveTextContent(/^Data & Analytics$/)
    expect(await departmentOptionTexts(user)).toEqual(['All', 'Data & Analytics'])
  })

  it('selects the loaded department that the link spells in another case, without a second entry', async () => {
    // The API matches departments case-insensitively: ?department=it lists the IT people.
    resourcesApi.list.mockResolvedValue(list([PRIYA]))
    const user = renderPage({ route: '/resources?department=it' })
    await screen.findByRole('table', { name: 'Resources' })
    expect(resourcesApi.list).toHaveBeenCalledWith({ department: 'it' })
    expect(screen.getByRole('combobox', { name: /Department/ })).toHaveTextContent(/^IT$/)
    expect(await departmentOptionTexts(user)).toEqual(['All', 'IT'])
  })

  it('follows a new link (e.g. the menu item), resetting the filters and the search box', async () => {
    const user = renderPage({ route: '/resources?search=priya&over_allocated=true' })
    await screen.findByRole('table')
    expect(searchBox()).toHaveValue('priya')
    await user.click(screen.getByRole('link', { name: 'Resources menu item' }))
    await waitFor(() => expect(resourcesApi.list).toHaveBeenLastCalledWith({}))
    expect(screen.getByLabelText('Over-allocated only')).not.toBeChecked()
    expect(searchBox()).toHaveValue('')
  })

  it('sorts people by their total allocation and names', async () => {
    const user = renderPage()
    const table = await screen.findByRole('table', { name: 'Resources' })
    const order = () => within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].firstChild.firstChild.textContent)
    expect(order()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
    await user.click(screen.getByRole('button', { name: 'Total allocation' }))
    await user.click(screen.getByRole('button', { name: 'Total allocation' }))
    expect(order()).toEqual(['Priya Shah', 'Tom Lee', 'Maria Garcia'])
    expect(screen.getByRole('columnheader', { name: 'Total allocation' })).toHaveAttribute('aria-sort', 'descending')
    await user.click(screen.getByRole('button', { name: 'Name' }))
    await user.click(screen.getByRole('button', { name: 'Name' }))
    expect(order()).toEqual(['Tom Lee', 'Priya Shah', 'Maria Garcia'])
  })

  it('narrows the list to over-allocated people from the call-out', async () => {
    const user = renderPage()
    await screen.findByRole('table')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Show over-allocated only' }))
    await waitFor(() => expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true }))
    expect(screen.getByLabelText('Over-allocated only')).toBeChecked()
    expect(currentUrl()).toBe('/resources?over_allocated=true')
  })

  it('lets the call-out put its action under the message when the screen is too narrow for both', async () => {
    renderPage()
    await screen.findByRole('table')
    const callout = screen.getByRole('alert')
    // The message keeps 16rem beside the icon; on a phone "Show over-allocated only" wraps below it
    // instead of breaking onto four lines next to the text.
    expect(callout).toHaveStyle({ flexWrap: 'wrap' })
    expect(callout.querySelector('.MuiAlert-message')).toHaveStyle({ flexGrow: '1', flexShrink: '1', flexBasis: '256px' }) // 16rem
    expect(within(callout).getByRole('button', { name: 'Show over-allocated only' })).toBeInTheDocument()
  })

  it('opens the detail page when a row is clicked', async () => {
    const user = renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByText('Tom Lee'))
    expect(await screen.findByText('Resource detail page')).toBeInTheDocument()
  })

  it('validates, then creates a resource with the documented payload', async () => {
    resourcesApi.create.mockResolvedValue({ ...MARIA, id: 10, full_name: 'Ana Lima' })
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'New resource' }))
    const dialog = screen.getByRole('dialog', { name: 'New resource' })
    const create = within(dialog).getByRole('button', { name: 'Create resource' })
    await user.click(create)
    expect(within(dialog).getAllByText('This field is required')).toHaveLength(4)
    expect(resourcesApi.create).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText(/Full name/), '  Ana Lima ')
    const email = within(dialog).getByLabelText(/Email/)
    expect(email).toHaveAttribute('type', 'email')
    await user.type(email, 'ana@acme')
    await user.type(within(dialog).getByLabelText(/Job title/), 'Designer')
    await user.type(within(dialog).getByLabelText(/Department/), 'Marketing')
    await user.click(create)
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument()
    expect(resourcesApi.create).not.toHaveBeenCalled()

    await user.type(email, '.com')
    await user.click(create)
    await waitFor(() =>
      expect(resourcesApi.create).toHaveBeenCalledWith({
        full_name: 'Ana Lima',
        email: 'ana@acme.com',
        job_title: 'Designer',
        department: 'Marketing',
      }),
    )
    expect(await screen.findByText('Resource created')).toBeInTheDocument()
    await waitFor(() => expect(resourcesApi.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a duplicate email reported by the API on the email field', async () => {
    resourcesApi.create.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT',
        message: 'A resource with this email already exists',
        details: { email: 'Already used by another team member' },
      }),
    )
    const user = renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'New resource' }))
    const dialog = screen.getByRole('dialog', { name: 'New resource' })
    await user.type(within(dialog).getByLabelText(/Full name/), 'Priya Two')
    await user.type(within(dialog).getByLabelText(/Email/), 'priya@acme.com')
    await user.type(within(dialog).getByLabelText(/Job title/), 'Developer')
    await user.type(within(dialog).getByLabelText(/Department/), 'IT')
    await user.click(within(dialog).getByRole('button', { name: 'Create resource' }))

    expect(await within(dialog).findByText('A resource with this email already exists')).toBeInTheDocument()
    const email = within(dialog).getByLabelText(/Email/)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription('Already used by another team member')
    expect(within(dialog).getByRole('button', { name: 'Create resource' })).toBeEnabled()
    expect(resourcesApi.list).toHaveBeenCalledTimes(1)
  })

  it('edits a resource with a full PUT body', async () => {
    resourcesApi.update.mockResolvedValue({ ...PRIYA, job_title: 'Tech Lead' })
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Edit Priya Shah' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit resource' })
    expect(within(dialog).getByLabelText(/Full name/)).toHaveValue('Priya Shah')
    expect(within(dialog).getByLabelText(/Email/)).toHaveValue('priya@acme.com')
    const jobTitle = within(dialog).getByLabelText(/Job title/)
    await user.clear(jobTitle)
    await user.type(jobTitle, 'Tech Lead')
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
    await waitFor(() => expect(resourcesApi.list).toHaveBeenCalledTimes(2))
  })

  it('deletes a resource after a confirmation that explains the cascade', async () => {
    resourcesApi.remove.mockResolvedValue(null)
    const user = renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Delete Priya Shah' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete resource?' })
    expect(dialog).toHaveTextContent('All of their project allocations will be removed')
    expect(dialog).toHaveTextContent('any deliverables they own will become unassigned')
    await user.click(within(dialog).getByRole('button', { name: 'Delete resource' }))

    await waitFor(() => expect(resourcesApi.remove).toHaveBeenCalledWith(4))
    expect(await screen.findByText('Resource deleted')).toBeInTheDocument()
    await waitFor(() => expect(resourcesApi.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the confirmation open with the error when a delete fails', async () => {
    resourcesApi.remove.mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN', message: 'You do not have permission' }))
    const user = renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Delete Tom Lee' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete resource?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete resource' }))
    expect(await within(dialog).findByText('You do not have permission')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(resourcesApi.list).toHaveBeenCalledTimes(1)
  })

  it('shows no create, edit or delete controls to a viewer', async () => {
    renderPage({ role: 'viewer' })
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'New resource' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('lets a contributor create and edit but not delete', async () => {
    renderPage({ role: 'contributor' })
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: 'New resource' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Tom Lee' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })

  it('shows the error with a working Retry button', async () => {
    resourcesApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' }))
    const user = renderPage()
    expect(await screen.findByText(/Database unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the team members. Database unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('table', { name: 'Resources' })).toBeInTheDocument()
    expect(resourcesApi.list).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state that invites the first resource', async () => {
    resourcesApi.list.mockResolvedValue(list([]))
    const user = renderPage()
    expect(await screen.findByText('No resources yet')).toBeInTheDocument()
    expect(screen.getByText('Add the first team member to start planning project allocations.')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'New resource' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1])
    expect(screen.getByRole('dialog', { name: 'New resource' })).toBeInTheDocument()
  })

  it('explains an empty filtered list', async () => {
    resourcesApi.list.mockResolvedValue(list([]))
    renderPage({ route: '/resources?over_allocated=true' })
    expect(await screen.findByText('No matching resources')).toBeInTheDocument()
    expect(screen.getByText('No team member matches these filters. Try changing or clearing them.')).toBeInTheDocument()
  })

  it('tells a viewer that team members appear once added', async () => {
    resourcesApi.list.mockResolvedValue(list([]))
    renderPage({ role: 'viewer' })
    expect(await screen.findByText('Team members will appear here once they are added.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New resource' })).not.toBeInTheDocument()
  })

  describe('List | Heat map views', () => {
    /** The people GET /resources knows about; a create adds one. */
    let people

    beforeEach(() => {
      people = RESOURCES
      resourcesApi.list.mockImplementation(async (filters) => list(matching(people, filters)))
    })

    it('shows the list by default, with "List" pressed', async () => {
      renderPage()
      expect(await screen.findByRole('table', { name: 'Resources' })).toBeInTheDocument()
      expect(viewButton('List')).toHaveAttribute('aria-pressed', 'true')
      expect(viewButton('Heat map')).toHaveAttribute('aria-pressed', 'false')
      expect(queryHeatmap()).not.toBeInTheDocument()
      expect(allocationsApi.list).not.toHaveBeenCalled()
    })

    it('switches to the heat map, keeping the filters in the URL and applying them to it', async () => {
      const user = renderPage({ route: '/resources?department=IT&search=priya' })
      await screen.findByRole('table', { name: 'Resources' })
      await user.click(viewButton('Heat map'))

      expect(currentUrl()).toBe('/resources?department=IT&search=priya&view=heatmap')
      await findHeatmap()
      expect(heatmapNames()).toEqual(['Priya Shah'])
      expect(screen.queryByRole('table', { name: 'Resources' })).not.toBeInTheDocument()
      expect(viewButton('Heat map')).toHaveAttribute('aria-pressed', 'true')
      // No one is loaded again: the heat map shows the people of the list and adds the allocations.
      expect(resourcesApi.list.mock.calls).toEqual([[{ department: 'IT', search: 'priya' }]])
      expect(allocationsApi.list).toHaveBeenCalledTimes(1)
      expect(searchBox()).toHaveValue('priya')
      expect(screen.getByRole('combobox', { name: /Department/ })).toHaveTextContent('IT')
    })

    it('opens the heat map from a link, with the filters of the link (#/resources?view=heatmap&over_allocated=true)', async () => {
      renderPage({ route: '/resources?view=heatmap&over_allocated=true' })
      expect(screen.getByRole('status')).toHaveTextContent('Loading the heat map')
      await findHeatmap()
      expect(heatmapNames()).toEqual(['Priya Shah'])
      // One GET /resources gives the heat map its people, the department options and the call-out.
      expect(resourcesApi.list.mock.calls).toEqual([[{ over_allocated: true }]])
      expect(allocationsApi.list).toHaveBeenCalledTimes(1)
      expect(allocationsApi.list).toHaveBeenCalledWith()
      expect(viewButton('Heat map')).toHaveAttribute('aria-pressed', 'true')
      expect(viewButton('List')).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByLabelText('Over-allocated only')).toBeChecked()
      expect(screen.queryByRole('table', { name: 'Resources' })).not.toBeInTheDocument()
    })

    it('switches back to the list, removing the view from the URL and keeping the filters', async () => {
      const user = renderPage({ route: '/resources?view=heatmap&over_allocated=true' })
      await findHeatmap()
      await user.click(viewButton('List'))

      expect(currentUrl()).toBe('/resources?over_allocated=true')
      const table = await screen.findByRole('table', { name: 'Resources' })
      expect(within(table).getAllByRole('row')).toHaveLength(2)
      expect(within(table).getByText('Priya Shah')).toBeInTheDocument()
      expect(queryHeatmap()).not.toBeInTheDocument()
      expect(viewButton('List')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('Over-allocated only')).toBeChecked()
    })

    it('falls back to the list for an unknown view', async () => {
      renderPage({ route: '/resources?view=chart' })
      expect(await screen.findByRole('table', { name: 'Resources' })).toBeInTheDocument()
      expect(viewButton('List')).toHaveAttribute('aria-pressed', 'true')
      expect(viewButton('Heat map')).toHaveAttribute('aria-pressed', 'false')
      expect(queryHeatmap()).not.toBeInTheDocument()
      expect(allocationsApi.list).not.toHaveBeenCalled()
    })

    it.each([
      ['the list', 'list'],
      ['the heat map', 'heatmap'],
    ])('writes each filter change in %s to the address bar, keeping the view parameter', async (name, view) => {
      const user = renderPage({ route: `/resources?view=${view}` })
      const table = await screen.findByRole('table')
      await user.click(screen.getByLabelText('Over-allocated only'))
      expect(currentUrl()).toBe(`/resources?view=${view}&over_allocated=true`)

      await user.click(screen.getByRole('combobox', { name: /Department/ }))
      await user.click(await screen.findByRole('option', { name: 'IT' }))
      expect(currentUrl()).toBe(`/resources?view=${view}&over_allocated=true&department=IT`)

      const box = searchBox()
      await user.type(box, 'priya')
      await waitFor(() => expect(currentUrl()).toBe(`/resources?view=${view}&over_allocated=true&department=IT&search=priya`))
      await waitFor(() => expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true, department: 'IT', search: 'priya' }))
      expect(searchBox()).toBe(box)
      expect(box).toHaveFocus()
      // Neither view starts again from scratch while the filters change.
      expect(screen.getByRole('table')).toBe(table)
      expect(viewButton(view === 'list' ? 'List' : 'Heat map')).toHaveAttribute('aria-pressed', 'true')
    })

    it('narrows the heat map to over-allocated people from the call-out', async () => {
      const user = renderPage({ route: '/resources?view=heatmap' })
      await findHeatmap()
      expect(heatmapNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
      const callout = await screen.findByRole('alert')
      expect(callout).toHaveTextContent('1 team member is over-allocated (more than 100% across active projects).')

      await user.click(within(callout).getByRole('button', { name: 'Show over-allocated only' }))
      expect(currentUrl()).toBe('/resources?view=heatmap&over_allocated=true')
      await waitFor(() => expect(heatmapNames()).toEqual(['Priya Shah']))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Over-allocated only')).toBeChecked()
    })

    it('loads the heat map again after a resource is created from it', async () => {
      resourcesApi.create.mockImplementation(async (payload) => {
        const created = { ...MARIA, ...payload, id: 10 }
        people = [created, ...people]
        return created
      })
      const user = renderPage({ route: '/resources?view=heatmap' })
      await findHeatmap()
      expect(allocationsApi.list).toHaveBeenCalledTimes(1)

      await user.click(screen.getByRole('button', { name: 'New resource' }))
      const dialog = screen.getByRole('dialog', { name: 'New resource' })
      await user.type(within(dialog).getByLabelText(/Full name/), 'Ana Lima')
      await user.type(within(dialog).getByLabelText(/Email/), 'ana@acme.com')
      await user.type(within(dialog).getByLabelText(/Job title/), 'Designer')
      await user.type(within(dialog).getByLabelText(/Department/), 'Marketing')
      await user.click(within(dialog).getByRole('button', { name: 'Create resource' }))

      expect(await screen.findByText('Resource created')).toBeInTheDocument()
      expect(await screen.findByRole('rowheader', { name: 'Ana Lima' })).toBeInTheDocument()
      expect(allocationsApi.list).toHaveBeenCalledTimes(2)
      // The people are loaded again once, for the heat map, the department options and the call-out.
      expect(resourcesApi.list).toHaveBeenCalledTimes(2)
      expect(viewButton('Heat map')).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows in the heat map when the people cannot be loaded, with a Retry that loads both lists again', async () => {
      resourcesApi.list.mockRejectedValueOnce(databaseDown())
      const user = renderPage({ route: '/resources?view=heatmap' })
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the heat map. Database unavailable')
      expect(queryHeatmap()).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Retry' }))
      await findHeatmap()
      expect(heatmapNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
      expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument()
      expect(resourcesApi.list).toHaveBeenCalledTimes(2)
      expect(allocationsApi.list).toHaveBeenCalledTimes(2)
    })

    it('keeps the heat map, with the error and Retry, when the people for new filters cannot be loaded', async () => {
      const user = renderPage({ route: '/resources?view=heatmap' })
      await findHeatmap()
      resourcesApi.list.mockRejectedValueOnce(databaseDown())
      await user.click(screen.getByLabelText('Over-allocated only'))

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh the heat map. Database unavailable')
      expect(heatmapNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
      await user.click(screen.getByRole('button', { name: 'Retry' }))
      await waitFor(() => expect(heatmapNames()).toEqual(['Priya Shah']))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true })
      expect(allocationsApi.list).toHaveBeenCalledTimes(2)
    })

    it('shows the empty state of the list, with its create action, in the heat map', async () => {
      people = []
      const user = renderPage({ route: '/resources?view=heatmap' })
      expect(await screen.findByText('No resources yet')).toBeInTheDocument()
      expect(screen.getByText('Add the first team member to start planning project allocations.')).toBeInTheDocument()
      const buttons = screen.getAllByRole('button', { name: 'New resource' })
      expect(buttons).toHaveLength(2)
      await user.click(buttons[1])
      expect(screen.getByRole('dialog', { name: 'New resource' })).toBeInTheDocument()
    })

    it('explains an empty filtered heat map, without the create action', async () => {
      renderPage({ route: '/resources?view=heatmap&search=zzz' })
      expect(await screen.findByText('No matching resources')).toBeInTheDocument()
      expect(screen.getByText('No team member matches these filters. Try changing or clearing them.')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'New resource' })).toHaveLength(1)
    })

    it('offers the heat map to a viewer and on phones', async () => {
      mobile.value = true
      const user = renderPage({ role: 'viewer' })
      expect(await screen.findAllByRole('listitem')).toHaveLength(RESOURCES.length)
      await user.click(viewButton('Heat map'))
      await findHeatmap()
      expect(heatmapNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
      expect(currentUrl()).toBe('/resources?view=heatmap')
    })
  })
})

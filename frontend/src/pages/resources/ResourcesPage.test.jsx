import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { MARIA, PRIYA, RESOURCES, list } from './resourceFixtures'
import ResourcesPage from './ResourcesPage'

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))
vi.mock('../../services/resourcesApi', () => ({
  resourcesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

function renderPage({ route = '/resources', role } = {}) {
  renderWithProviders(<ResourcesPage />, {
    route,
    role,
    path: '/resources',
    extraRoutes: [{ path: '/resources/:resourceId', element: <p>Resource detail page</p> }],
  })
  return userEvent.setup({ delay: null })
}

const rowOf = (name) => screen.getByText(name).closest('tr')

// Long form flows: extra time so a busy machine (e.g. a coverage run) does not make them flaky.
describe('ResourcesPage', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mobile.value = false
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
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

  it('narrows the list to over-allocated people from the call-out', async () => {
    const user = renderPage()
    await screen.findByRole('table')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Show over-allocated only' }))
    await waitFor(() => expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true }))
    expect(screen.getByLabelText('Over-allocated only')).toBeChecked()
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
})

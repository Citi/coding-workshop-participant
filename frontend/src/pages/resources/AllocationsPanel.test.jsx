import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allocationsApi } from '../../services/allocationsApi'
import { ApiError } from '../../services/apiClient'
import { projectsApi } from '../../services/projectsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import AllocationsPanel from './AllocationsPanel'
import { APOLLO_TEAM, PRIYA_ALLOCATIONS, PRIYA_APOLLO, PROJECTS, RESOURCES, TOM_APOLLO, list } from './resourceFixtures'

vi.mock('../../services/allocationsApi', () => ({
  allocationsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../services/resourcesApi', () => ({ resourcesApi: { list: vi.fn() } }))
vi.mock('../../services/projectsApi', () => ({ projectsApi: { list: vi.fn() } }))

function renderPanel(props = {}, options = {}) {
  const onChange = vi.fn()
  renderWithProviders(<AllocationsPanel onChange={onChange} {...props} />, options)
  return { onChange, user: userEvent.setup({ delay: null }) }
}

/** Open the form and wait until its options are loaded (the submit button only exists then). */
async function openForm(user, buttonName, dialogName, submitLabel) {
  await user.click(screen.getByRole('button', { name: buttonName }))
  await screen.findByRole('button', { name: submitLabel })
  return screen.getByRole('dialog', { name: dialogName })
}

async function choose(user, dialog, fieldName, optionName) {
  await user.click(within(dialog).getByRole('combobox', { name: fieldName }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

async function optionLabels(user, dialog, fieldName) {
  await user.click(within(dialog).getByRole('combobox', { name: fieldName }))
  const labels = (await screen.findAllByRole('option')).map((option) => option.textContent)
  await user.keyboard('{Escape}')
  return labels
}

const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent)
const rowOf = (name) => screen.getByRole('link', { name }).closest('tr')
const toastOf = (text) => screen.getByText(text).closest('.MuiAlert-root')

// Long form flows: extra time so a busy machine (e.g. a coverage run) does not make them flaky.
describe('AllocationsPanel', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks()
    allocationsApi.list.mockResolvedValue(list(APOLLO_TEAM))
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
    projectsApi.list.mockResolvedValue(list(PROJECTS))
  })

  describe('lists', () => {
    it("one person's projects with their status, without repeating the person", async () => {
      allocationsApi.list.mockResolvedValue(list(PRIYA_ALLOCATIONS))
      renderPanel({ resourceId: 4, title: 'Project allocations' })
      expect(screen.getByRole('status')).toHaveTextContent('Loading')
      const table = await screen.findByRole('table', { name: 'Project allocations' })
      expect(allocationsApi.list).toHaveBeenCalledWith({ resource_id: 4 })
      expect(screen.getByRole('heading', { level: 2, name: 'Project allocations' })).toBeInTheDocument()
      expect(headers()).toEqual(['Project', 'Project status', 'Allocation', 'Actions'])
      expect(within(table).getAllByRole('row')).toHaveLength(PRIYA_ALLOCATIONS.length + 1)

      expect(screen.getByRole('link', { name: 'Apollo CRM' })).toHaveAttribute('href', '/projects/1')
      const hermes = rowOf('Hermes Portal')
      expect(within(hermes).getByText('Planned')).toBeInTheDocument()
      expect(within(hermes).getByRole('progressbar', { name: '30%' })).toBeInTheDocument()
      expect(within(rowOf('Zeus ERP')).getByText('Active')).toBeInTheDocument()
      expect(screen.queryByText(/each person's sum/)).not.toBeInTheDocument()
    })

    it("a project's team with each person's total and over-allocation flag", async () => {
      renderPanel({ projectId: '1' })
      await screen.findByRole('table', { name: 'Team allocations' })
      expect(allocationsApi.list).toHaveBeenCalledWith({ project_id: 1 })
      expect(headers()).toEqual(['Team member', 'Allocation', 'Total allocation', 'Actions'])

      const priya = rowOf('Priya Shah')
      expect(screen.getByRole('link', { name: 'Priya Shah' })).toHaveAttribute('href', '/resources/4')
      expect(within(priya).getByRole('progressbar', { name: '60%' })).toHaveClass('MuiLinearProgress-colorPrimary')
      expect(within(priya).getByRole('progressbar', { name: '120%' })).toHaveClass('MuiLinearProgress-colorError')
      expect(within(priya).getByText('Over-allocated')).toBeInTheDocument()

      const tom = rowOf('Tom Lee')
      expect(within(tom).getAllByRole('progressbar', { name: '40%' })).toHaveLength(2)
      expect(within(tom).queryByText('Over-allocated')).not.toBeInTheDocument()
      expect(screen.getByText(/Total allocation is each person's sum across all active projects/)).toBeInTheDocument()
    })

    it("sorted by project status label or allocation from the headers, ties keeping the API order", async () => {
      allocationsApi.list.mockResolvedValue(list(PRIYA_ALLOCATIONS))
      const { user } = renderPanel({ resourceId: 4 })
      await screen.findByRole('table', { name: 'Project allocations' })
      const order = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getByRole('link').textContent)
      const sortBy = (header) => user.click(screen.getByRole('button', { name: header }))

      await sortBy('Project status')
      expect(order()).toEqual(['Apollo CRM', 'Zeus ERP', 'Hermes Portal'])
      await sortBy('Allocation')
      expect(order()).toEqual(['Hermes Portal', 'Apollo CRM', 'Zeus ERP'])
      await sortBy('Allocation')
      expect(order()).toEqual(['Apollo CRM', 'Zeus ERP', 'Hermes Portal'])
      await sortBy('Project')
      await sortBy('Project')
      expect(order()).toEqual(['Zeus ERP', 'Hermes Portal', 'Apollo CRM'])
    })

    it('every allocation with person and project when nothing is fixed', async () => {
      renderPanel()
      await screen.findByRole('table', { name: 'Allocations' })
      expect(allocationsApi.list).toHaveBeenCalledWith({})
      expect(headers()).toEqual(['Team member', 'Project', 'Project status', 'Allocation', 'Total allocation', 'Actions'])
      expect(screen.getAllByRole('link', { name: 'Apollo CRM' })).toHaveLength(2)
    })
  })

  it('creates a team member allocation for a project with validation and the documented payload', async () => {
    allocationsApi.create.mockResolvedValue({
      ...TOM_APOLLO, id: 10, resource_id: 6, resource_name: 'Maria Garcia', allocation_percent: 50,
      resource_total_allocation_percent: 50, resource_over_allocated: false,
    })
    const { user, onChange } = renderPanel({ projectId: 1 })
    await screen.findByRole('table')
    const dialog = await openForm(user, 'New allocation', 'New allocation', 'Create allocation')
    expect(resourcesApi.list).toHaveBeenCalledTimes(1)
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
    expect(dialog).toHaveTextContent('Add a team member to this project.')

    const project = within(dialog).getByRole('combobox', { name: /Project/ })
    expect(project).toHaveTextContent('Apollo CRM (Active)')
    expect(project).toHaveAttribute('aria-disabled', 'true')
    // Priya and Tom are already on Apollo, so only Maria can be added.
    expect(dialog).toHaveTextContent('People already on this project are not listed.')
    expect(await optionLabels(user, dialog, /Team member/)).toEqual(['Maria Garcia (0% allocated)'])

    const create = within(dialog).getByRole('button', { name: 'Create allocation' })
    await user.click(create)
    expect(within(dialog).getAllByText('This field is required')).toHaveLength(2)
    await choose(user, dialog, /Team member/, 'Maria Garcia (0% allocated)')

    const percent = within(dialog).getByLabelText(/Allocation \(%\)/)
    await user.type(percent, '150')
    await user.click(create)
    expect(within(dialog).getByText('Must be at most 100')).toBeInTheDocument()
    await user.clear(percent)
    await user.type(percent, '0')
    await user.click(create)
    expect(within(dialog).getByText('Must be at least 1')).toBeInTheDocument()
    await user.clear(percent)
    await user.type(percent, '12.5')
    await user.click(create)
    expect(within(dialog).getByText('Must be a whole number')).toBeInTheDocument()
    expect(allocationsApi.create).not.toHaveBeenCalled()

    await user.clear(percent)
    await user.type(percent, '50')
    await user.click(create)
    await waitFor(() => expect(allocationsApi.create).toHaveBeenCalledWith({ resource_id: 6, project_id: 1, allocation_percent: 50 }))
    expect(await screen.findByText('Allocation created')).toBeInTheDocument()
    expect(toastOf('Allocation created')).toHaveClass('MuiAlert-colorSuccess')
    expect(onChange).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(allocationsApi.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('warns when the saved allocation makes the person over-allocated', async () => {
    allocationsApi.list.mockResolvedValue(list([TOM_APOLLO]))
    allocationsApi.create.mockResolvedValue({
      ...TOM_APOLLO, id: 11, project_id: 2, project_name: 'Zeus ERP', allocation_percent: 70,
      resource_total_allocation_percent: 110, resource_over_allocated: true,
    })
    const { user } = renderPanel({ resourceId: 5 })
    await screen.findByRole('table')
    const dialog = await openForm(user, 'New allocation', 'New allocation', 'Create allocation')

    const person = within(dialog).getByRole('combobox', { name: /Team member/ })
    expect(person).toHaveTextContent('Tom Lee (40% allocated)')
    expect(person).toHaveAttribute('aria-disabled', 'true')
    expect(await optionLabels(user, dialog, /Project/)).toEqual(['Hermes Portal (Planned)', 'Zeus ERP (Active)'])
    expect(dialog).toHaveTextContent('Projects this person is already on are not listed.')

    await choose(user, dialog, /Project/, 'Zeus ERP (Active)')
    await user.type(within(dialog).getByLabelText(/Allocation \(%\)/), '70')
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }))

    await waitFor(() => expect(allocationsApi.create).toHaveBeenCalledWith({ resource_id: 5, project_id: 2, allocation_percent: 70 }))
    const message = 'Allocation created. Tom Lee is now over-allocated (110%)'
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(toastOf(message)).toHaveClass('MuiAlert-colorWarning')
  })

  it('shows a duplicate allocation reported by the API on the team member field', async () => {
    allocationsApi.create.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT',
        message: 'This person is already allocated to this project',
        details: { resource_id: 'Already on this project' },
      }),
    )
    const { user, onChange } = renderPanel()
    await screen.findByRole('table')
    const dialog = await openForm(user, 'New allocation', 'New allocation', 'Create allocation')
    await choose(user, dialog, /Team member/, 'Priya Shah (120% allocated)')
    await choose(user, dialog, /Project/, 'Apollo CRM (Active)')
    await user.type(within(dialog).getByLabelText(/Allocation \(%\)/), '10')
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }))

    expect(await within(dialog).findByText('This person is already allocated to this project')).toBeInTheDocument()
    const fieldError = within(dialog).getByText('Already on this project')
    expect(fieldError).toHaveClass('Mui-error')
    expect(fieldError.closest('.MuiFormControl-root')).toContainElement(within(dialog).getByRole('combobox', { name: /Team member/ }))
    expect(within(dialog).getByRole('button', { name: 'Create allocation' })).toBeEnabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('edits an allocation with a full PUT body', async () => {
    allocationsApi.list.mockResolvedValue(list(PRIYA_ALLOCATIONS))
    allocationsApi.update.mockResolvedValue({
      ...PRIYA_APOLLO, allocation_percent: 40, resource_total_allocation_percent: 100, resource_over_allocated: false,
    })
    const { user, onChange } = renderPanel({ resourceId: 4 })
    await screen.findByRole('table')
    const dialog = await openForm(user, 'Edit allocation for Priya Shah on Apollo CRM', 'Edit allocation', 'Save changes')

    expect(within(dialog).getByRole('combobox', { name: /Project/ })).toHaveTextContent('Apollo CRM (Active)')
    // Her other projects are left out: one allocation per person per project.
    expect(await optionLabels(user, dialog, /Project/)).toEqual(['Apollo CRM (Active)'])
    const percent = within(dialog).getByLabelText(/Allocation \(%\)/)
    expect(percent).toHaveValue(60)
    await user.clear(percent)
    await user.type(percent, '40')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(allocationsApi.update).toHaveBeenCalledWith(3, { resource_id: 4, project_id: 1, allocation_percent: 40 }))
    expect(await screen.findByText('Allocation updated')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(allocationsApi.list).toHaveBeenCalledTimes(2))
  })

  it('deletes an allocation after a confirmation that explains the effect', async () => {
    allocationsApi.remove.mockResolvedValue(null)
    const { user, onChange } = renderPanel({ projectId: 1 })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Delete allocation for Tom Lee on Apollo CRM' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete allocation?' })
    expect(dialog).toHaveTextContent('Tom Lee will no longer be allocated to Apollo CRM (40%).')
    expect(dialog).toHaveTextContent('deliverables they own are not changed')
    await user.click(within(dialog).getByRole('button', { name: 'Delete allocation' }))

    await waitFor(() => expect(allocationsApi.remove).toHaveBeenCalledWith(9))
    expect(await screen.findByText('Allocation deleted')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(allocationsApi.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the allocation when the delete is cancelled', async () => {
    const { user, onChange } = renderPanel({ projectId: 1 })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Delete allocation for Priya Shah on Apollo CRM' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Delete allocation?' })).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(allocationsApi.remove).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Priya Shah' })).toBeInTheDocument()
  })

  it('shows an error inside the form when its options cannot be loaded, with Retry and Cancel', async () => {
    resourcesApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' }))
    const { user } = renderPanel({ projectId: 1 })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'New allocation' }))
    const loading = screen.getByRole('dialog', { name: 'New allocation' })
    expect(await within(loading).findByText(/Could not load the form/)).toBeInTheDocument()
    await user.click(within(loading).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Create allocation' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(allocationsApi.create).not.toHaveBeenCalled()
  })

  it('shows no create, edit or delete controls to a viewer', async () => {
    renderPanel({ projectId: 1 }, { role: 'viewer' })
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'New allocation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit allocation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete allocation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('lets a contributor create and edit but not delete', async () => {
    renderPanel({ projectId: 1 }, { role: 'contributor' })
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: 'New allocation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit allocation for Priya Shah on Apollo CRM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete allocation/ })).not.toBeInTheDocument()
  })

  it('shows the error with a working Retry button', async () => {
    allocationsApi.list.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error' }))
    const { user } = renderPanel({ projectId: 1 })
    expect(await screen.findByText(/Unexpected server error/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the allocations. Unexpected server error')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('table', { name: 'Team allocations' })).toBeInTheDocument()
  })

  it.each([
    [{ projectId: 1 }, 'admin', 'No team members yet', 'Allocate people to this project to build its team.'],
    [{ projectId: 1 }, 'viewer', 'No team members yet', 'Team members will appear here once they are allocated.'],
    [{ resourceId: 4 }, 'admin', 'No project allocations yet', 'Allocate this person to a project to plan their workload.'],
    [{ resourceId: 4 }, 'viewer', 'No project allocations yet', 'Projects this person works on will appear here.'],
    [{}, 'admin', 'No allocations yet', 'Allocate a team member to a project to get started.'],
    [{}, 'viewer', 'No allocations yet', 'Allocations will appear here once they are created.'],
  ])('shows an empty state for %o as %s', async (props, role, title, message) => {
    allocationsApi.list.mockResolvedValue(list([]))
    renderPanel(props, { role })
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
  })
})

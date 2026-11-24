import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { deliverablesApi } from '../../services/deliverablesApi'
import { projectsApi } from '../../services/projectsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import DeliverablesPanel from './DeliverablesPanel'
import { DELIVERABLES, PROJECTS, RESOURCES, SIGN_OFF, SIGN_OFF_DETAILS, list } from './deliverableFixtures'

vi.mock('../../services/deliverablesApi', () => ({
  deliverablesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../services/projectsApi', () => ({ projectsApi: { list: vi.fn() } }))
vi.mock('../../services/resourcesApi', () => ({ resourcesApi: { list: vi.fn() } }))

/** Queries sent by the list itself (the form loads its options with a bare list() call). */
const listQueries = () => deliverablesApi.list.mock.calls.filter(([query]) => query !== undefined).map(([query]) => query)

function renderPanel(props = {}, options = {}) {
  const onChange = vi.fn()
  renderWithProviders(<DeliverablesPanel onChange={onChange} {...props} />, options)
  return { onChange, user: userEvent.setup() }
}

async function openForm(user, buttonName, submitLabel) {
  await user.click(screen.getByRole('button', { name: buttonName }))
  await screen.findByRole('button', { name: submitLabel })
  return screen.getByRole('dialog')
}

async function choose(user, container, fieldName, optionName) {
  await user.click(within(container).getByRole('combobox', { name: fieldName }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

describe('DeliverablesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deliverablesApi.list.mockResolvedValue(list(DELIVERABLES))
    projectsApi.list.mockResolvedValue(list(PROJECTS))
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
  })

  it('shows a loading state, then the deliverables with key, overdue and dependency details', async () => {
    renderPanel()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    const table = await screen.findByRole('table', { name: 'Deliverables' })
    expect(within(table).getAllByRole('row')).toHaveLength(DELIVERABLES.length + 1)
    const row = within(table).getByText('Requirements sign-off').closest('tr')
    expect(within(row).getByTitle('Key deliverable')).toHaveTextContent('Key')
    expect(within(row).getByText('Mar 1, 2026 (Overdue)')).toBeInTheDocument()
    expect(within(row).getByText('In progress')).toBeInTheDocument()
    expect(within(row).getByText('Apollo CRM')).toBeInTheDocument()
    expect(within(row).getByText('Priya Shah')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    const interviews = within(table).getByText('Stakeholder interviews').closest('tr')
    expect(within(interviews).getByText('Unassigned')).toBeInTheDocument()
    expect(within(interviews).queryByText('Key')).not.toBeInTheDocument()
    expect(within(interviews).getByText('Feb 1, 2026')).toBeInTheDocument()
    expect(listQueries()).toEqual([{}])
  })

  it('sends search, project, status, key and overdue filters as query parameters', async () => {
    const { user } = renderPanel()
    await screen.findByRole('table')
    await user.click(screen.getByLabelText('Key deliverables only'))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true }))
    await user.click(screen.getByLabelText('Overdue only'))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true, overdue: true }))
    await choose(user, document.body, /Status/, 'Blocked')
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true, overdue: true, status: 'blocked' }))
    await choose(user, document.body, /Project/, 'Zeus ERP')
    await waitFor(() =>
      expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true, overdue: true, status: 'blocked', project_id: 2 }),
    )
    await user.type(screen.getByLabelText('Search'), 'audit')
    await waitFor(() =>
      expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true, overdue: true, status: 'blocked', project_id: 2, search: 'audit' }),
    )
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({}))
  })

  it('validates, then creates a deliverable with the documented payload', async () => {
    deliverablesApi.create.mockResolvedValue({ ...SIGN_OFF, id: 20 })
    const { user, onChange } = renderPanel()
    await screen.findByRole('table')
    const dialog = await openForm(user, 'New deliverable', 'Create deliverable')
    expect(dialog).toHaveAccessibleName('New deliverable')

    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }))
    expect(within(dialog).getAllByText('This field is required')).toHaveLength(3)
    expect(deliverablesApi.create).not.toHaveBeenCalled()

    await choose(user, dialog, /Project/, 'Zeus ERP')
    await user.type(within(dialog).getByLabelText(/Name/), 'Go-live checklist')
    await user.type(within(dialog).getByLabelText('Description'), 'Final checks')
    await user.type(within(dialog).getByLabelText(/Due date/), '2026-12-31')
    await choose(user, dialog, /Owner/, 'Tom Lee')
    await user.click(within(dialog).getByLabelText('Key deliverable'))
    await choose(user, dialog, /Depends on/, 'Data audit (Zeus ERP)')
    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }))

    await waitFor(() =>
      expect(deliverablesApi.create).toHaveBeenCalledWith({
        project_id: 2,
        name: 'Go-live checklist',
        description: 'Final checks',
        status: 'not_started',
        due_date: '2026-12-31',
        is_key: true,
        owner_id: 5,
        depends_on_ids: [9],
      }),
    )
    expect(await screen.findByText('Deliverable created')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(listQueries()).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows API validation errors next to the matching field', async () => {
    deliverablesApi.create.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT',
        message: 'A deliverable with this name already exists in this project',
        details: { name: 'Must be unique within the project' },
      }),
    )
    const { user, onChange } = renderPanel()
    await screen.findByRole('table')
    const dialog = await openForm(user, 'New deliverable', 'Create deliverable')
    await choose(user, dialog, /Project/, 'Apollo CRM')
    await user.type(within(dialog).getByLabelText(/Name/), 'Requirements sign-off')
    await user.type(within(dialog).getByLabelText(/Due date/), '2026-06-30')
    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }))

    expect(await within(dialog).findByText('A deliverable with this name already exists in this project')).toBeInTheDocument()
    expect(within(dialog).getByText('Must be unique within the project')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create deliverable' })).toBeEnabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('edits a deliverable with a full PUT body and maps a dependency cycle error to its field', async () => {
    deliverablesApi.update
      .mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { depends_on_ids: 'Would create a dependency cycle' },
        }),
      )
      .mockResolvedValueOnce(SIGN_OFF)
    const { user, onChange } = renderPanel()
    await screen.findByRole('table')
    const dialog = await openForm(user, 'Edit Requirements sign-off', 'Save changes')
    expect(dialog).toHaveAccessibleName('Edit deliverable')
    const name = within(dialog).getByLabelText(/Name/)
    expect(name).toHaveValue('Requirements sign-off')
    expect(within(dialog).getByLabelText(/Due date/)).toHaveValue('2026-03-01')
    expect(within(dialog).getByLabelText('Key deliverable')).toBeChecked()

    // The deliverable itself and "Build MVP" (which depends on it) cannot be prerequisites.
    await user.click(within(dialog).getByRole('combobox', { name: /Depends on/ }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Data audit (Zeus ERP)',
      'Stakeholder interviews (Apollo CRM)',
      'Vendor contract (Zeus ERP)',
    ])
    await user.click(screen.getByRole('option', { name: 'Vendor contract (Zeus ERP)' }))
    await user.clear(name)
    await user.type(name, 'Requirements approved')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await within(dialog).findByText('Would create a dependency cycle')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(deliverablesApi.update).toHaveBeenCalledTimes(2))
    const [id, payload] = deliverablesApi.update.mock.calls[1]
    expect(id).toBe(10)
    expect({ ...payload, depends_on_ids: [...payload.depends_on_ids].sort((a, b) => a - b) }).toEqual({
      project_id: 1,
      name: 'Requirements approved',
      description: 'Scope agreed with sales',
      status: 'in_progress',
      due_date: '2026-03-01',
      is_key: true,
      owner_id: 4,
      depends_on_ids: [7, 8, 9],
    })
    expect(await screen.findByText('Deliverable updated')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('deletes a deliverable after a confirmation that explains the impact', async () => {
    deliverablesApi.remove.mockResolvedValue(null)
    const { user, onChange } = renderPanel()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Delete Requirements sign-off' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete deliverable?' })
    // The consequences are the dialog's accessible description, announced when it opens.
    expect(dialog).toHaveAccessibleDescription(
      '"Requirements sign-off" will be permanently deleted. Deliverables that depend on it will lose this prerequisite. ' +
        'This cannot be undone.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Delete deliverable' }))
    await waitFor(() => expect(deliverablesApi.remove).toHaveBeenCalledWith(10))
    expect(await screen.findByText('Deliverable deleted')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(listQueries()).toHaveLength(2))
  })

  it('keeps the confirmation open with the error when the delete fails', async () => {
    deliverablesApi.remove.mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN', message: 'You do not have permission' }))
    const { user, onChange } = renderPanel()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Delete Data audit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete deliverable?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete deliverable' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You do not have permission')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('hides every change control from viewers', async () => {
    renderPanel({}, { role: 'viewer' })
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'New deliverable' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('lets contributors create and edit but not delete', async () => {
    renderPanel({}, { role: 'contributor' })
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: 'New deliverable' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Requirements sign-off' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })

  it('shows the load error with a working Retry', async () => {
    deliverablesApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' }))
    const { user } = renderPanel()
    expect(await screen.findByText(/Database is unavailable/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('table', { name: 'Deliverables' })).toBeInTheDocument()
  })

  it('explains an empty list, with or without filters', async () => {
    deliverablesApi.list.mockResolvedValue(list([]))
    const { user } = renderPanel()
    expect(await screen.findByText('No deliverables yet')).toBeInTheDocument()
    expect(screen.getByText('Add the first deliverable to start tracking progress.')).toBeInTheDocument()
    // The empty state repeats the New button, like the Projects and Resources lists.
    const buttons = screen.getAllByRole('button', { name: 'New deliverable' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1])
    await screen.findByRole('button', { name: 'Create deliverable' })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('New deliverable')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByLabelText('Overdue only'))
    expect(await screen.findByText('No matching deliverables')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New deliverable' })).toHaveLength(1)
  })

  it('does not repeat the New button in an empty project tab', async () => {
    deliverablesApi.list.mockResolvedValue(list([]))
    renderPanel({ projectId: 1 })
    expect(await screen.findByText('No deliverables yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New deliverable' })).toHaveLength(1)
  })

  it('tells viewers that deliverables will appear once added', async () => {
    deliverablesApi.list.mockResolvedValue(list([]))
    renderPanel({}, { role: 'viewer' })
    expect(await screen.findByText('Deliverables will appear here once they are added.')).toBeInTheDocument()
  })

  it('lists one project only and locks the form to it', async () => {
    const project = DELIVERABLES.filter((item) => item.project_id === 1)
    deliverablesApi.list.mockImplementation((query) => Promise.resolve(list(query ? project : DELIVERABLES)))
    deliverablesApi.create.mockResolvedValue({ ...SIGN_OFF, id: 21 })
    const { user } = renderPanel({ projectId: '1' })
    await screen.findByRole('table')
    expect(listQueries()).toEqual([{ project_id: 1 }])
    expect(screen.queryByRole('columnheader', { name: 'Project' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Project/ })).not.toBeInTheDocument()
    expect(projectsApi.list).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('Key deliverables only'))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true, project_id: 1 }))

    const dialog = await openForm(user, 'New deliverable', 'Create deliverable')
    const projectSelect = within(dialog).getByRole('combobox', { name: /Project/ })
    expect(projectSelect).toHaveAttribute('aria-disabled', 'true')
    expect(projectSelect).toHaveTextContent('Apollo CRM')
    await user.type(within(dialog).getByLabelText(/Name/), 'UAT')
    await user.type(within(dialog).getByLabelText(/Due date/), '2026-12-01')
    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }))
    await waitFor(() => expect(deliverablesApi.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: 1, name: 'UAT' })))
  })

  it('preselects the filtered project for a new deliverable', async () => {
    const { user } = renderPanel({ initialFilters: { project_id: 2 } })
    await screen.findByRole('table')
    expect(listQueries()).toEqual([{ project_id: 2 }])
    const dialog = await openForm(user, 'New deliverable', 'Create deliverable')
    const projectSelect = within(dialog).getByRole('combobox', { name: /Project/ })
    expect(projectSelect).toHaveTextContent('Zeus ERP')
    expect(projectSelect).not.toHaveAttribute('aria-disabled')
  })

  it('copes with a filter for a project that no longer exists', async () => {
    deliverablesApi.list.mockResolvedValue(list([]))
    const { user } = renderPanel({ initialFilters: { project_id: 99 } })
    expect(await screen.findByText('No matching deliverables')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Project/ })).toHaveTextContent('Project #99'))
    const dialog = await openForm(user, 'New deliverable', 'Create deliverable')
    expect(within(dialog).getByRole('combobox', { name: /Project/ })).not.toHaveTextContent(/\w/)
  })

  it('lets the user retry when the form options fail to load, or cancel', async () => {
    projectsApi.list.mockResolvedValueOnce(list(PROJECTS)).mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server' }))
    const { user } = renderPanel()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'New deliverable' }))
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    const dialog = await screen.findByRole('dialog', { name: 'New deliverable' })
    await within(dialog).findByRole('button', { name: 'Create deliverable' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deliverablesApi.create).not.toHaveBeenCalled()
  })

  it('opens the dependency details when a row is clicked', async () => {
    deliverablesApi.get.mockResolvedValue(SIGN_OFF_DETAILS)
    const { user } = renderPanel()
    await screen.findByRole('table')
    await user.click(screen.getByText('Requirements sign-off'))
    const dialog = await screen.findByRole('dialog', { name: 'Requirements sign-off' })
    expect(await within(dialog).findByText('Dependency chain (3)')).toBeInTheDocument()
    expect(deliverablesApi.get).toHaveBeenCalledWith(10)
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

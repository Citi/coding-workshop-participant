import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

// Due dates are worded relative to today (UTC), so the tests run on a fixed day: Mar 4, 2026.
const TODAY = new Date('2026-03-04T12:00:00Z')

/** Queries sent by the list itself (the form loads its options with a bare list() call). */
const listQueries = () => deliverablesApi.list.mock.calls.filter(([query]) => query !== undefined).map(([query]) => query)

/** The cell of a table row in the column with this header. */
function cellOf(row, header) {
  const headers = within(row.closest('table')).getAllByRole('columnheader').map((cell) => cell.textContent)
  return row.cells[headers.indexOf(header)]
}

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
    // Only Date is faked: timers stay real for Testing Library and user-event.
    vi.setSystemTime(TODAY)
    mobile.value = false
    deliverablesApi.list.mockResolvedValue(list(DELIVERABLES))
    projectsApi.list.mockResolvedValue(list(PROJECTS))
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a loading state, then the deliverables with key, overdue and dependency details', async () => {
    renderPanel()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    const table = await screen.findByRole('table', { name: 'Deliverables' })
    expect(within(table).getAllByRole('row')).toHaveLength(DELIVERABLES.length + 1)
    const row = within(table).getByText('Requirements sign-off').closest('tr')
    expect(within(row).getByTitle('Key deliverable')).toHaveTextContent('Key')
    expect(within(row).getByText('Mar 1, 2026')).toBeInTheDocument()
    expect(within(row).getByText('3 days overdue')).toBeInTheDocument()
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

  it('says how close each due date is, with no urgency for completed deliverables', async () => {
    renderPanel()
    const table = await screen.findByRole('table', { name: 'Deliverables' })
    const dueDateOf = (name) => cellOf(within(table).getByText(name).closest('tr'), 'Due date')
    expect(dueDateOf('Vendor contract')).toHaveTextContent('Jan 10, 2026 53 days overdue')
    expect(dueDateOf('Requirements sign-off')).toHaveTextContent('Mar 1, 2026 3 days overdue')
    expect(dueDateOf('Data audit')).toHaveTextContent('Dec 20, 2026 Due in 9 months')
    expect(dueDateOf('Build MVP')).toHaveTextContent('Jan 15, 2027 Due in 10 months')
    // Completed, so past its due date but not overdue.
    expect(dueDateOf('Stakeholder interviews')).toHaveTextContent(/^Feb 1, 2026$/)
  })

  it('keeps the due date and its urgency together on the mobile cards', async () => {
    mobile.value = true
    renderPanel()
    const cards = within(await screen.findByRole('list', { name: 'Deliverables' })).getAllByRole('listitem')
    expect(cards).toHaveLength(DELIVERABLES.length)
    const dueDateOn = (name) => {
      const card = cards.find((item) => within(item).queryByText(name))
      return within(card).getByText('Due date').nextElementSibling
    }
    expect(dueDateOn('Requirements sign-off')).toHaveTextContent('Mar 1, 2026 3 days overdue')
    expect(dueDateOn('Data audit')).toHaveTextContent('Dec 20, 2026 Due in 9 months')
    expect(dueDateOn('Stakeholder interviews')).toHaveTextContent(/^Feb 1, 2026$/)
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
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the deliverables. Database is unavailable')
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

  it('leaves the URL alone when it is part of another page (a project tab)', async () => {
    function UrlProbe() {
      const location = useLocation()
      return <p data-testid="url">{`${location.pathname}${location.search}`}</p>
    }
    renderWithProviders(
      <>
        <DeliverablesPanel projectId="1" />
        <UrlProbe />
      </>,
      { route: '/projects/1?tab=deliverables', path: '/projects/:projectId' },
    )
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByLabelText('Key deliverables only'))
    await choose(user, document.body, /Status/, 'Blocked')
    await user.type(screen.getByLabelText('Search'), 'audit')
    await waitFor(() =>
      expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true, status: 'blocked', search: 'audit', project_id: 1 }),
    )
    expect(screen.getByTestId('url')).toHaveTextContent('/projects/1?tab=deliverables')
  })

  it('sorts by status label, due date and owner, with unassigned deliverables last', async () => {
    const { user } = renderPanel()
    const table = await screen.findByRole('table', { name: 'Deliverables' })
    const order = () => within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].firstChild.firstChild.textContent)
    await user.click(screen.getByRole('button', { name: 'Status' }))
    // Blocked, Completed, In progress, In progress (API order kept), Not started
    expect(order()).toEqual(['Data audit', 'Stakeholder interviews', 'Vendor contract', 'Requirements sign-off', 'Build MVP'])
    await user.click(screen.getByRole('button', { name: 'Due date' }))
    expect(order()).toEqual(['Vendor contract', 'Stakeholder interviews', 'Requirements sign-off', 'Data audit', 'Build MVP'])
    await user.click(screen.getByRole('button', { name: 'Owner' }))
    await user.click(screen.getByRole('button', { name: 'Owner' }))
    expect(order()).toEqual(['Data audit', 'Requirements sign-off', 'Build MVP', 'Vendor contract', 'Stakeholder interviews'])
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

import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { expensesApi } from '../../services/expensesApi'
import { projectsApi } from '../../services/projectsApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { todayIso } from '../../utils/format'
import { APOLLO, EXPENSES_TOTAL, FLIGHTS, LAPTOPS, LICENCES, listOf, ZEUS } from './budgetFixtures'
import ExpensesPanel from './ExpensesPanel'

vi.mock('../../services/expensesApi', () => ({
  expensesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../services/projectsApi', () => ({ projectsApi: { list: vi.fn() } }))

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

// These are long user flows: on a busy machine allow slow renders instead of failing.
configure({ asyncUtilTimeout: 5000 })
const SLOW_MACHINE = { timeout: 30000 }

function renderPanel(props = {}, options = {}) {
  const onChange = vi.fn()
  renderWithProviders(<ExpensesPanel onChange={onChange} {...props} />, options)
  return { onChange, user: userEvent.setup({ delay: null }) }
}

const findTable = () => screen.findByRole('table', { name: 'Expenses' })
const rowOf = (text) => screen.getByText(text).closest('tr')
const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent)
const dateInput = (label) => screen.getByLabelText(label)

/** Pick an option in an MUI select and wait for its menu to close. */
async function choose(user, label, option, container = document.body) {
  await user.click(within(container).getByRole('combobox', { name: label }))
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', { name: option }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

async function retype(user, input, text) {
  await user.clear(input)
  await user.type(input, text)
}

async function openCreateDialog(user) {
  await findTable()
  await user.click(screen.getByRole('button', { name: 'New expense' }))
  return screen.getByRole('dialog', { name: 'New expense' })
}

async function fillValidExpense(user, dialog) {
  await choose(user, /Category/, 'Travel', dialog)
  await user.type(within(dialog).getByLabelText(/Description/), 'Hotel in Berlin')
  await user.type(within(dialog).getByLabelText(/Amount/), '420.5')
}

beforeEach(() => {
  vi.resetAllMocks()
  mobile.value = false
  expensesApi.list.mockResolvedValue(listOf(LICENCES, FLIGHTS, LAPTOPS))
  projectsApi.list.mockResolvedValue(listOf(ZEUS, APOLLO))
})

describe('ExpensesPanel', SLOW_MACHINE, () => {
  it('shows a loading state, then each expense and the total of the listed expenses', async () => {
    renderPanel()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    await findTable()
    expect(expensesApi.list).toHaveBeenCalledWith({})
    expect(headers()).toEqual(['Date', 'Project', 'Category', 'Description', 'Amount', 'Actions'])

    const licences = rowOf('CRM licences')
    expect(within(licences).getByText('Feb 15, 2026')).toBeInTheDocument()
    expect(within(licences).getByRole('link', { name: 'Apollo CRM' })).toHaveAttribute('href', '/projects/1')
    expect(within(licences).getByText('Software')).toBeInTheDocument()
    expect(within(licences).getAllByRole('cell')[4]).toHaveTextContent('$12,000.00')
    expect(within(rowOf('Flights to the Berlin office')).getByText('$845.50')).toBeInTheDocument()

    expect(screen.getByText(/Total of 3 listed expenses/)).toHaveTextContent(`Total of 3 listed expenses: ${EXPENSES_TOTAL}`)
  })

  it('sends search, category, project and date filters to the API as query parameters', async () => {
    const { user } = renderPanel()
    await findTable()
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'hotel')
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({ search: 'hotel' }))
    await choose(user, 'Category', 'Travel')
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({ search: 'hotel', category: 'travel' }))
    await choose(user, 'Project', 'Zeus ERP')
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({ search: 'hotel', category: 'travel', project_id: 2 }))

    await user.type(dateInput('From'), '2026-03-01')
    await waitFor(() =>
      expect(expensesApi.list).toHaveBeenLastCalledWith({ search: 'hotel', category: 'travel', project_id: 2, date_from: '2026-03-01' }),
    )
    await user.type(dateInput('To'), '2026-03-31')
    await waitFor(() =>
      expect(expensesApi.list).toHaveBeenLastCalledWith({
        search: 'hotel', category: 'travel', project_id: 2, date_from: '2026-03-01', date_to: '2026-03-31',
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({}))
    expect(dateInput('From')).toHaveValue('')
    expect(dateInput('To')).toHaveValue('')
  })

  it('sorts expenses by date, category label and amount from the column headers', async () => {
    const { user } = renderPanel()
    await findTable()
    const order = () => screen.getAllByRole('row').slice(1).map((row) => row.cells[3].textContent)
    const sortBy = (header) => user.click(screen.getByRole('button', { name: header }))
    expect(order()).toEqual(['CRM licences', 'Flights to the Berlin office', 'Developer laptops'])

    await sortBy('Date')
    expect(order()).toEqual(['Developer laptops', 'CRM licences', 'Flights to the Berlin office'])
    await sortBy('Category')
    await sortBy('Category')
    expect(order()).toEqual(['Flights to the Berlin office', 'CRM licences', 'Developer laptops'])
    await sortBy('Amount')
    expect(order()).toEqual(['Flights to the Berlin office', 'Developer laptops', 'CRM licences'])
    await sortBy('Project')
    expect(order()).toEqual(['CRM licences', 'Developer laptops', 'Flights to the Berlin office'])
  })

  it('does not query an inverted date range and explains the problem', async () => {
    const { user } = renderPanel()
    await findTable()
    await user.type(dateInput('From'), '2026-03-01')
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({ date_from: '2026-03-01' }))
    const callsBefore = expensesApi.list.mock.calls.length

    await user.type(dateInput('To'), '2026-02-01')
    expect(await screen.findByText('Must be on or after the From date')).toBeInTheDocument()
    expect(dateInput('To')).toHaveAttribute('aria-invalid', 'true')
    // Other filter changes wait until the range is fixed, too.
    await choose(user, 'Category', 'Labor')
    expect(expensesApi.list).toHaveBeenCalledTimes(callsBefore)

    await retype(user, dateInput('To'), '2026-03-01')
    await waitFor(() =>
      expect(expensesApi.list).toHaveBeenLastCalledWith({ date_from: '2026-03-01', date_to: '2026-03-01', category: 'labor' }),
    )
    expect(screen.queryByText('Must be on or after the From date')).not.toBeInTheDocument()
  })

  it('creates an expense after validating the form, then refreshes the list and the parent', async () => {
    expensesApi.create.mockResolvedValue(makeCreated())
    const { user, onChange } = renderPanel()
    const dialog = await openCreateDialog(user)
    expect(within(dialog).getByLabelText(/Date/)).toHaveValue(todayIso())

    await user.click(within(dialog).getByRole('button', { name: 'Create expense' }))
    expect(within(dialog).getByText('Please fix the highlighted fields.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('This field is required')).toHaveLength(4)

    await choose(user, /Project/, 'Zeus ERP', dialog)
    await fillValidExpense(user, dialog)
    await retype(user, within(dialog).getByLabelText(/Amount/), '0')
    await user.click(within(dialog).getByRole('button', { name: 'Create expense' }))
    expect(within(dialog).getByText('Must be greater than 0')).toBeInTheDocument()
    await retype(user, within(dialog).getByLabelText(/Amount/), '10.123')
    await user.click(within(dialog).getByRole('button', { name: 'Create expense' }))
    expect(within(dialog).getByText('Use at most 2 decimal places')).toBeInTheDocument()
    expect(expensesApi.create).not.toHaveBeenCalled()

    await retype(user, within(dialog).getByLabelText(/Amount/), '420.5')
    await retype(user, within(dialog).getByLabelText(/Date/), '2026-03-03')
    await user.click(within(dialog).getByRole('button', { name: 'Create expense' }))

    await waitFor(() =>
      expect(expensesApi.create).toHaveBeenCalledWith({
        project_id: 2, category: 'travel', description: 'Hotel in Berlin', amount: 420.5, expense_date: '2026-03-03',
      }),
    )
    expect(await screen.findByText('Expense created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(expensesApi.list).toHaveBeenCalledTimes(2))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('preselects the project the list is filtered by', async () => {
    const { user } = renderPanel()
    await findTable()
    await choose(user, 'Project', 'Zeus ERP')
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({ project_id: 2 }))
    await user.click(screen.getByRole('button', { name: 'New expense' }))
    const dialog = screen.getByRole('dialog', { name: 'New expense' })
    expect(within(dialog).getByRole('combobox', { name: /Project/ })).toHaveTextContent('Zeus ERP')
  })

  it('shows server validation errors next to the matching field', async () => {
    const message = 'Project does not exist'
    expensesApi.create.mockRejectedValue(
      new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details: { project_id: message } }),
    )
    const { user, onChange } = renderPanel()
    const dialog = await openCreateDialog(user)
    await choose(user, /Project/, 'Apollo CRM', dialog)
    await fillValidExpense(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create expense' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Validation failed')
    expect(within(dialog).getByText(message)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create expense' })).toBeEnabled()
    expect(expensesApi.list).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('edits an expense with a full update', async () => {
    expensesApi.update.mockResolvedValue({ ...FLIGHTS, amount: 900 })
    const { user, onChange } = renderPanel()
    await findTable()
    await user.click(screen.getByRole('button', { name: 'Edit Flights to the Berlin office' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit expense' })
    expect(within(dialog).getByRole('combobox', { name: /Project/ })).toHaveTextContent('Zeus ERP')
    expect(within(dialog).getByRole('combobox', { name: /Category/ })).toHaveTextContent('Travel')
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue('Flights to the Berlin office')
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue(845.5)
    expect(within(dialog).getByLabelText(/Date/)).toHaveValue('2026-03-02')

    await retype(user, within(dialog).getByLabelText(/Amount/), '900')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(expensesApi.update).toHaveBeenCalledWith(8, {
        project_id: 2, category: 'travel', description: 'Flights to the Berlin office', amount: 900, expense_date: '2026-03-02',
      }),
    )
    expect(await screen.findByText('Expense updated')).toBeInTheDocument()
    await waitFor(() => expect(expensesApi.list).toHaveBeenCalledTimes(2))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('deletes an expense after a confirmation that explains the budget impact', async () => {
    expensesApi.remove.mockResolvedValue(null)
    const { user, onChange } = renderPanel()
    await findTable()
    await user.click(screen.getByRole('button', { name: 'Delete CRM licences' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete expense?' })
    expect(dialog).toHaveTextContent('the amount spent on Apollo CRM will go down by $12,000.00')

    await user.click(within(dialog).getByRole('button', { name: 'Delete expense' }))
    await waitFor(() => expect(expensesApi.remove).toHaveBeenCalledWith(7))
    expect(await screen.findByText('Expense deleted')).toBeInTheDocument()
    await waitFor(() => expect(expensesApi.list).toHaveBeenCalledTimes(2))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps the confirmation open with the error when a delete fails', async () => {
    const message = 'Your role does not allow this action'
    expensesApi.remove.mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN', message }))
    const { user, onChange } = renderPanel()
    await findTable()
    await user.click(screen.getByRole('button', { name: 'Delete Developer laptops' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete expense?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete expense' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows viewers no create, edit or delete controls', async () => {
    renderPanel({}, { role: 'viewer' })
    await findTable()
    expect(screen.queryByRole('button', { name: 'New expense' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('lets contributors create and edit, but not delete', async () => {
    renderPanel({}, { role: 'contributor' })
    await findTable()
    expect(screen.getByRole('button', { name: 'New expense' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit CRM licences' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })

  it('shows the error with a Retry button when loading fails', async () => {
    expensesApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The database is unavailable' }))
    const { user } = renderPanel()
    expect(await screen.findByText(/The database is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the expenses. The database is unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findTable()).toBeInTheDocument()
    expect(expensesApi.list).toHaveBeenCalledTimes(2)
  })

  it('lets the user retry when the project list cannot be loaded', async () => {
    projectsApi.list.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected error' }))
    const { user } = renderPanel()
    expect(await screen.findByText(/Could not load the project list/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText(/Could not load the project list/)).not.toBeInTheDocument())
    await choose(user, 'Project', 'Apollo CRM')
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({ project_id: 1 }))
  })

  it('invites users who can create to record the first expense', async () => {
    expensesApi.list.mockResolvedValue(listOf())
    renderPanel()
    expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
    expect(screen.getByText('Record the first expense to start tracking the money spent against the budget.')).toBeInTheDocument()
    expect(screen.queryByText(/Total of/)).not.toBeInTheDocument()
  })

  it('tells viewers when there are no expenses or none match the filters', async () => {
    expensesApi.list.mockResolvedValue(listOf())
    const { user } = renderPanel({}, { role: 'viewer' })
    expect(await screen.findByText('Expenses will appear here once they are recorded.')).toBeInTheDocument()
    await choose(user, 'Category', 'Other')
    expect(await screen.findByText('No matching expenses')).toBeInTheDocument()
    expect(screen.getByText(/Try changing or clearing them/)).toBeInTheDocument()
  })

  it('shows only one project when given a projectId, with the project fixed in the form', async () => {
    expensesApi.list.mockResolvedValue(listOf(LICENCES, LAPTOPS))
    expensesApi.create.mockResolvedValue(makeCreated())
    const { user, onChange } = renderPanel({ projectId: '1' })
    await findTable()
    expect(expensesApi.list).toHaveBeenCalledWith({ project_id: 1 })
    expect(headers()).toEqual(['Date', 'Category', 'Description', 'Amount', 'Actions'])
    expect(screen.queryByRole('combobox', { name: 'Project' })).not.toBeInTheDocument()
    expect(screen.getByText(/Total of 2 listed expenses/)).toHaveTextContent('$13,999.99')

    await choose(user, 'Category', 'Hardware')
    await waitFor(() => expect(expensesApi.list).toHaveBeenLastCalledWith({ category: 'hardware', project_id: 1 }))

    await user.click(screen.getByRole('button', { name: 'New expense' }))
    const dialog = screen.getByRole('dialog', { name: 'New expense' })
    const project = within(dialog).getByRole('combobox', { name: /Project/ })
    expect(project).toHaveTextContent('Apollo CRM')
    expect(project).toHaveAttribute('aria-disabled', 'true')
    await fillValidExpense(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create expense' }))
    await waitFor(() =>
      expect(expensesApi.create).toHaveBeenCalledWith({
        project_id: 1, category: 'travel', description: 'Hotel in Berlin', amount: 420.5, expense_date: todayIso(),
      }),
    )
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('names the fixed project even when it is missing from the project list', async () => {
    projectsApi.list.mockResolvedValue(listOf())
    expensesApi.list.mockResolvedValue(listOf())
    const { user } = renderPanel({ projectId: 1 })
    expect(await screen.findByText('No expenses for this project yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New expense' }))
    const dialog = screen.getByRole('dialog', { name: 'New expense' })
    expect(within(dialog).getByRole('combobox', { name: /Project/ })).toHaveTextContent('This project')
  })

  it('shows expenses as cards on mobile', async () => {
    mobile.value = true
    renderPanel()
    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(3)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(cards[0]).getByText('Feb 15, 2026')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Amount')).toBeInTheDocument()
    expect(within(cards[0]).getByRole('button', { name: 'Edit CRM licences' })).toBeInTheDocument()
    expect(screen.getByText(/Total of 3 listed expenses/)).toBeInTheDocument()
  })
})

function makeCreated() {
  return { ...FLIGHTS, id: 20, description: 'Hotel in Berlin', amount: 420.5 }
}

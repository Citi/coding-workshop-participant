// Expense form (FormDialog config), filters and request helpers, mirroring docs/API.md › Expenses.
import { formatCurrency, formatDate, todayIso } from '../../utils/format'
import { optionsFor } from '../../utils/labels'
import { isBlank, maxTwoDecimals } from '../../utils/validators'

export const MAX_AMOUNT = 999999999999.99
export const DESCRIPTION_MAX_LENGTH = 255

/** The API's amount rule: greater than 0, at most MAX_AMOUNT, at most 2 decimals. */
export function validAmount(value) {
  if (isBlank(value)) return undefined
  const amount = Number(value)
  if (!(amount > 0)) return 'Must be greater than 0'
  if (amount > MAX_AMOUNT) return `Must be at most ${formatCurrency(MAX_AMOUNT)}`
  return maxTwoDecimals(value)
}

/**
 * Fields for creating/editing an expense.
 * projectOptions: [{ value, label }]; fixedProject: the project is locked (the project's own page).
 */
export function expenseFields({ projectOptions, fixedProject = false }) {
  return [
    {
      name: 'project_id',
      label: 'Project',
      type: 'select',
      required: true,
      options: projectOptions,
      disabled: fixedProject,
      autoFocus: !fixedProject,
    },
    { name: 'category', label: 'Category', type: 'select', required: true, options: optionsFor('category'), autoFocus: fixedProject },
    { name: 'description', label: 'Description', required: true, maxLength: DESCRIPTION_MAX_LENGTH },
    { name: 'amount', label: 'Amount (USD)', type: 'number', required: true, validate: validAmount, half: true },
    { name: 'expense_date', label: 'Date', type: 'date', required: true, half: true },
  ]
}

/** Starting values for a new expense: today's date and the fixed (or preselected) project. */
export function newExpenseValues(projectId) {
  return { project_id: projectId ?? '', expense_date: todayIso() }
}

/** FormDialog values -> POST/PUT body. PUT is a full update, so every stored field is sent. */
export function toExpensePayload(values) {
  return {
    project_id: values.project_id,
    category: values.category,
    description: values.description,
    amount: values.amount,
    expense_date: values.expense_date,
  }
}

/** Delete confirmation text: removing an expense lowers what its project has spent. */
export function deleteExpenseMessage(expense) {
  const amount = formatCurrency(expense.amount)
  return (
    `"${expense.description}" (${amount} on ${formatDate(expense.expense_date)}) will be permanently deleted, ` +
    `and the amount spent on ${expense.project_name} will go down by ${amount}. This cannot be undone.`
  )
}

/** FilterBar selects: category, plus project when the list is not fixed to one project. */
export function expenseFilters(projectOptions) {
  return [
    { name: 'category', label: 'Category', options: optionsFor('category') },
    ...(projectOptions ? [{ name: 'project_id', label: 'Project', options: projectOptions }] : []),
  ]
}

/** The API rejects date_from > date_to; both are 'YYYY-MM-DD', so comparing the strings compares the dates. */
export function dateRangeError(from, to) {
  return from && to && from > to ? 'Must be on or after the From date' : undefined
}

/** Filter values with `name` set to `value`, or removed when it is empty (as FilterBar does). */
export function withFilter(filters, name, value) {
  const next = { ...filters }
  if (value === undefined || value === null || value === '') delete next[name]
  else next[name] = value
  return next
}

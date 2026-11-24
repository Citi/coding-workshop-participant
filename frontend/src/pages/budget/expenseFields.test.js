import { describe, expect, it } from 'vitest'
import { todayIso } from '../../utils/format'
import { LICENCES } from './budgetFixtures'
import {
  dateRangeError,
  deleteExpenseMessage,
  expenseFields,
  expenseFilters,
  newExpenseValues,
  toExpensePayload,
  validAmount,
  withFilter,
} from './expenseFields'

const PROJECT_OPTIONS = [{ value: 1, label: 'Apollo CRM' }]

describe('validAmount', () => {
  it('accepts positive amounts with up to 2 decimals', () => {
    expect(validAmount('0.01')).toBeUndefined()
    expect(validAmount('12000')).toBeUndefined()
    expect(validAmount('999999999999.99')).toBeUndefined()
    expect(validAmount('')).toBeUndefined()
  })

  it('rejects zero, negative, too large and over-precise amounts', () => {
    expect(validAmount('0')).toBe('Must be greater than 0')
    expect(validAmount('-5')).toBe('Must be greater than 0')
    expect(validAmount('1000000000000')).toBe('Must be at most $999,999,999,999.99')
    expect(validAmount('10.123')).toBe('Use at most 2 decimal places')
  })
})

describe('expenseFields', () => {
  it('lists the documented fields with their rules', () => {
    const fields = expenseFields({ projectOptions: PROJECT_OPTIONS })
    expect(fields.map((field) => field.name)).toEqual(['project_id', 'category', 'description', 'amount', 'expense_date'])
    expect(fields.every((field) => field.required)).toBe(true)
    expect(fields[0]).toMatchObject({ type: 'select', options: PROJECT_OPTIONS, disabled: false, autoFocus: true })
    expect(fields[1].options.map((option) => option.value)).toEqual(['labor', 'software', 'hardware', 'travel', 'other'])
    expect(fields[2].maxLength).toBe(255)
    expect(fields[3]).toMatchObject({ type: 'number', validate: validAmount })
    expect(fields[4].type).toBe('date')
  })

  it('locks the project when the form belongs to one project', () => {
    const [project, category] = expenseFields({ projectOptions: PROJECT_OPTIONS, fixedProject: true })
    expect(project).toMatchObject({ disabled: true, autoFocus: false })
    expect(category.autoFocus).toBe(true)
  })
})

describe('request helpers', () => {
  it('starts a new expense today, for the given project', () => {
    expect(newExpenseValues(3)).toEqual({ project_id: 3, expense_date: todayIso() })
    expect(newExpenseValues()).toEqual({ project_id: '', expense_date: todayIso() })
  })

  it('sends exactly the stored fields (a full PUT body)', () => {
    expect(toExpensePayload(LICENCES)).toEqual({
      project_id: 1, category: 'software', description: 'CRM licences', amount: 12000, expense_date: '2026-02-15',
    })
  })

  it('explains what a delete changes', () => {
    expect(deleteExpenseMessage(LICENCES)).toBe(
      '"CRM licences" ($12,000.00 on Feb 15, 2026) will be permanently deleted, and the amount spent on Apollo CRM ' +
        'will go down by $12,000.00. This cannot be undone.',
    )
  })
})

describe('filters', () => {
  it('offers the project filter only when the list is not fixed to a project', () => {
    expect(expenseFilters().map((filter) => filter.name)).toEqual(['category'])
    expect(expenseFilters(PROJECT_OPTIONS)).toEqual([
      expect.objectContaining({ name: 'category' }),
      { name: 'project_id', label: 'Project', options: PROJECT_OPTIONS },
    ])
  })

  it('validates the date range like the API (inclusive, From <= To)', () => {
    expect(dateRangeError('2026-03-01', '2026-02-28')).toBe('Must be on or after the From date')
    expect(dateRangeError('2026-03-01', '2026-03-01')).toBeUndefined()
    expect(dateRangeError('2026-03-01', undefined)).toBeUndefined()
    expect(dateRangeError(undefined, '2026-03-01')).toBeUndefined()
  })

  it('sets or removes a single filter value', () => {
    const filters = { category: 'travel' }
    expect(withFilter(filters, 'date_from', '2026-01-01')).toEqual({ category: 'travel', date_from: '2026-01-01' })
    expect(withFilter({ ...filters, date_from: '2026-01-01' }, 'date_from', '')).toEqual(filters)
    expect(withFilter(filters, 'date_to', null)).toEqual(filters)
    expect(filters).toEqual({ category: 'travel' })
  })
})

// Test data for the budget tests: API expense objects and the project fields the budget screens read
// (docs/API.md › Expenses and › Projects).

export function makeExpense(overrides = {}) {
  return {
    id: 7,
    project_id: 1,
    project_name: 'Apollo CRM',
    category: 'software',
    description: 'CRM licences',
    amount: 12000,
    expense_date: '2026-02-15',
    created_at: '2026-02-15T09:00:00+00:00',
    updated_at: '2026-02-15T09:00:00+00:00',
    ...overrides,
  }
}

export const LICENCES = makeExpense()
export const FLIGHTS = makeExpense({
  id: 8,
  project_id: 2,
  project_name: 'Zeus ERP',
  category: 'travel',
  description: 'Flights to the Berlin office',
  amount: 845.5,
  expense_date: '2026-03-02',
})
export const LAPTOPS = makeExpense({
  id: 9,
  category: 'hardware',
  description: 'Developer laptops',
  amount: 1999.99,
  expense_date: '2026-01-20',
})
/** LICENCES + FLIGHTS + LAPTOPS */
export const EXPENSES_TOTAL = '$14,845.49'

export function makeProject(overrides = {}) {
  return {
    id: 1,
    name: 'Apollo CRM',
    department: 'Sales',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    budget: 150000,
    budget_spent: 61000,
    budget_remaining: 89000,
    budget_used_percent: 40.7,
    over_budget: false,
    ...overrides,
  }
}

/** Within budget. */
export const APOLLO = makeProject()
/** 120% used. */
export const ZEUS = makeProject({
  id: 2,
  name: 'Zeus ERP',
  department: 'Finance',
  budget: 50000,
  budget_spent: 60000,
  budget_remaining: -10000,
  budget_used_percent: 120,
  over_budget: true,
})
/** Money spent against a zero budget: the API sends budget_used_percent null. */
export const HERMES = makeProject({
  id: 3,
  name: 'Hermes Payments',
  status: 'planned',
  budget: 0,
  budget_spent: 500,
  budget_remaining: -500,
  budget_used_percent: null,
  over_budget: true,
})
/** 90% used: shown in the warning colour. */
export const ORION = makeProject({
  id: 4,
  name: 'Orion Analytics',
  status: 'completed',
  budget: 20000,
  budget_spent: 18000,
  budget_remaining: 2000,
  budget_used_percent: 90,
})
/** Cancelled: left out of every budget figure. */
export const ATLAS = makeProject({
  id: 5,
  name: 'Atlas Migration',
  status: 'cancelled',
  budget: 80000,
  budget_spent: 20000,
  budget_remaining: 60000,
  budget_used_percent: 25,
})

/** GET list response body. */
export function listOf(...items) {
  return { items, total: items.length }
}

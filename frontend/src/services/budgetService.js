import { createServiceClient, unwrap } from './api';

/**
 * Budgets and the spend recorded against them. Backed by backend/budgets.
 *
 * The planned figure lives on the project; actuals are individual expense line
 * items. "Consumed vs planned" is therefore an aggregate over expenses set
 * against the project's own column, so the two can never drift apart.
 */

const client = createServiceClient('budgets');

/**
 * @param {object} params
 * @param {string} [params.projectId]
 * @param {string} [params.status]        filter by project status
 * @param {boolean} [params.overspentOnly]
 */
export function listBudgets(params = {}) {
  return unwrap(client.get('/budgets', { params }));
}

/** One project's budget, including the split by expense category. */
export function getBudget(projectId) {
  return unwrap(client.get(`/budgets/${projectId}`));
}

/** Sets the planned figure. Requires manage_budgets (ADMIN / PROJECT_MANAGER). */
export function updatePlannedBudget(projectId, plannedBudget) {
  return unwrap(client.put(`/budgets/${projectId}`, { plannedBudget }));
}

// -- Expenses ---------------------------------------------------------------

/**
 * @param {object} params
 * @param {string} [params.projectId]
 * @param {string} [params.category] labor|tooling|travel|licensing|hardware|other
 * @param {string} [params.since]    ISO date
 * @param {string} [params.until]    ISO date
 */
export function listExpenses(params = {}) {
  return unwrap(client.get('/expenses', { params }));
}

export function getExpense(id) {
  return unwrap(client.get(`/expenses/${id}`));
}

/**
 * Records spend.
 *
 * A 201 may carry a `budgetWarning` when the entry tips the project over its
 * planned budget -- surfaced at the moment it happens, which is when a manager
 * needs to know.
 */
export function createExpense(payload) {
  return unwrap(client.post('/expenses', payload));
}

export function updateExpense(id, payload) {
  return unwrap(client.put(`/expenses/${id}`, payload));
}

export function deleteExpense(id) {
  return unwrap(client.delete(`/expenses/${id}`));
}

// Pure budget maths for the Budget page and the expenses list. Money is added up in whole cents,
// so totals never drift (0.1 + 0.2 stays 0.3). Totals follow docs/API.md › Dashboard: cancelled
// projects are left out, and "% used" has 1 decimal (0 when nothing is planned).

const toCents = (value) => Math.round((Number(value) || 0) * 100)

/** Sum of money values (numbers with up to 2 decimals). */
export function sumMoney(values) {
  return values.reduce((total, value) => total + toCents(value), 0) / 100
}

/** Projects that count towards the budget: every project except cancelled ones (as on the dashboard). */
export function budgetedProjects(projects) {
  return projects.filter((project) => project.status !== 'cancelled')
}

/** Portfolio totals: planned, spent, remaining, % used and the number of over-budget projects. */
export function budgetSummary(projects) {
  const counted = budgetedProjects(projects)
  const totalPlanned = sumMoney(counted.map((project) => project.budget))
  const totalSpent = sumMoney(counted.map((project) => project.budget_spent))
  return {
    projectCount: counted.length,
    totalPlanned,
    totalSpent,
    remaining: (toCents(totalPlanned) - toCents(totalSpent)) / 100,
    usedPercent: totalPlanned > 0 ? Math.round((totalSpent * 1000) / totalPlanned) / 10 : 0,
    overBudgetCount: counted.filter((project) => project.over_budget).length,
  }
}

/**
 * Highest share of the budget used first, then by name. `null` means money was spent against a
 * zero budget, so it sorts first (like the dashboard's budget_by_project).
 */
export function sortByBudgetUsed(projects) {
  const used = (project) => project.budget_used_percent ?? Infinity
  return [...projects].sort((a, b) => used(b) - used(a) || a.name.localeCompare(b.name))
}

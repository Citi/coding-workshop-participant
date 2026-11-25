import { describe, expect, it } from 'vitest'
import { APOLLO, ATLAS, HERMES, makeProject, ORION, ZEUS } from './budgetFixtures'
import { budgetedProjects, budgetSummary, sortByBudgetUsed, sumMoney } from './budgetMetrics'

describe('sumMoney', () => {
  it('adds money values in cents, without floating-point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(sumMoney([12000, 845.5, 1999.99])).toBe(14845.49)
    expect(sumMoney([])).toBe(0)
    expect(sumMoney([null, undefined, '10.25'])).toBe(10.25)
  })
})

describe('budgetedProjects', () => {
  it('leaves out cancelled projects only', () => {
    expect(budgetedProjects([APOLLO, ATLAS, HERMES, ORION])).toEqual([APOLLO, HERMES, ORION])
  })
})

describe('budgetSummary', () => {
  it('totals planned, spent and remaining money without cancelled projects', () => {
    expect(budgetSummary([APOLLO, ZEUS, HERMES, ORION, ATLAS])).toEqual({
      projectCount: 4,
      totalPlanned: 220000,
      totalSpent: 139500,
      remaining: 80500,
      usedPercent: 63.4,
      overBudgetCount: 2,
    })
  })

  it('reports a negative remainder when spending exceeds the plan', () => {
    const summary = budgetSummary([ZEUS])
    expect(summary.remaining).toBe(-10000)
    expect(summary.usedPercent).toBe(120)
  })

  it('uses 0% when nothing is planned, like the dashboard', () => {
    expect(budgetSummary([HERMES]).usedPercent).toBe(0)
    expect(budgetSummary([])).toEqual({
      projectCount: 0, totalPlanned: 0, totalSpent: 0, remaining: 0, usedPercent: 0, overBudgetCount: 0,
    })
  })

  it('keeps cents exact', () => {
    const summary = budgetSummary([makeProject({ budget: 0.3, budget_spent: 0.1 }), makeProject({ budget: 0, budget_spent: 0.1 })])
    expect(summary.totalPlanned).toBe(0.3)
    expect(summary.totalSpent).toBe(0.2)
    expect(summary.remaining).toBe(0.1)
  })
})

describe('sortByBudgetUsed', () => {
  it('puts the highest share used first, with "spent against no budget" (null) at the top', () => {
    expect(sortByBudgetUsed([APOLLO, ORION, HERMES, ZEUS]).map((project) => project.name)).toEqual([
      'Hermes Payments', 'Zeus ERP', 'Orion Analytics', 'Apollo CRM',
    ])
  })

  it('orders ties by name and does not change the input', () => {
    const input = [makeProject({ name: 'Beta', budget_used_percent: 50 }), makeProject({ name: 'Alpha', budget_used_percent: 50 })]
    const nulls = [makeProject({ name: 'Zed', budget_used_percent: null }), makeProject({ name: 'Ann', budget_used_percent: null })]
    expect(sortByBudgetUsed(input).map((project) => project.name)).toEqual(['Alpha', 'Beta'])
    expect(sortByBudgetUsed(nulls).map((project) => project.name)).toEqual(['Ann', 'Zed'])
    expect(input.map((project) => project.name)).toEqual(['Beta', 'Alpha'])
  })
})

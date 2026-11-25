import { describe, expect, it } from 'vitest'
import { AT_RISK_OR_OVERDUE, HEALTH_FILTER_OPTIONS, HEALTH_SEVERITY, healthRank, HEALTH_STATES, sortLabel } from './labels'

describe('sort keys', () => {
  it('sorts enum values by their visible label, empty ones last (null)', () => {
    expect(sortLabel('project', 'on_hold')).toBe('On hold')
    expect(sortLabel('role', 'admin')).toBe('Admin')
    expect(sortLabel('project', 'unknown')).toBe('unknown')
    for (const empty of [null, undefined, '']) expect(sortLabel('project', empty)).toBeNull()
  })

  it('ranks health from the most to the least severe, no health last (null)', () => {
    expect(HEALTH_SEVERITY.map(healthRank)).toEqual([0, 1, 2])
    expect(healthRank('overdue')).toBeLessThan(healthRank('at_risk'))
    expect(healthRank('at_risk')).toBeLessThan(healthRank('on_track'))
    expect(healthRank(null)).toBeNull()
    expect(healthRank('sick')).toBeNull()
    expect([...HEALTH_SEVERITY].sort()).toEqual(HEALTH_STATES.map((state) => state.value).sort())
  })
})

describe('health filter', () => {
  it('offers each state and "At risk or overdue" (GET /projects?health=at_risk,overdue)', () => {
    expect(AT_RISK_OR_OVERDUE).toBe('at_risk,overdue')
    expect(HEALTH_FILTER_OPTIONS).toEqual([
      { value: 'on_track', label: 'On track' },
      { value: 'at_risk', label: 'At risk' },
      { value: 'overdue', label: 'Overdue' },
      { value: 'at_risk,overdue', label: 'At risk or overdue' },
    ])
  })
})

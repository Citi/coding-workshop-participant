import { describe, expect, it } from 'vitest'
import { budgetUsedLabel, completionPercent, daysBetween, elapsedPercent, isClosed, startsInLabel } from './projectMetrics'
import { countLabel } from '../../utils/text'

describe('projectMetrics', () => {
  it('pluralises counts', () => {
    expect(countLabel(1, 'day')).toBe('1 day')
    expect(countLabel(0, 'deliverable')).toBe('0 deliverables')
    expect(countLabel(undefined, 'team allocation')).toBe('0 team allocations')
    expect(countLabel(2, 'person', 'people')).toBe('2 people')
  })

  it('counts calendar days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2026-03-10', '2026-03-01')).toBe(-9)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
  })

  it('computes the share of the schedule that has elapsed', () => {
    expect(elapsedPercent('2026-01-01', '2026-12-31', '2025-12-01')).toBe(0)
    expect(elapsedPercent('2026-01-01', '2026-12-31', '2026-01-01')).toBe(0)
    expect(elapsedPercent('2026-01-01', '2026-01-11', '2026-01-06')).toBe(50)
    expect(elapsedPercent('2026-01-01', '2026-12-31', '2027-02-01')).toBe(100)
    expect(elapsedPercent('2026-01-01', '2026-12-31', '2026-12-31')).toBe(100)
  })

  it('counts down to the start date in the words of every other date label', () => {
    expect(startsInLabel('2026-02-01', '2026-01-31')).toBe('Starts tomorrow')
    expect(startsInLabel('2026-02-01', '2026-01-27')).toBe('Starts in 5 days')
    expect(startsInLabel('2026-02-01', '2026-01-19')).toBe('Starts in 13 days')
    expect(startsInLabel('2026-02-01', '2026-01-18')).toBe('Starts in 2 weeks')
    expect(startsInLabel('2026-02-01', '2025-12-31')).toBe('Starts in 4 weeks')
    expect(startsInLabel('2026-04-01', '2026-01-31')).toBe('Starts in 2 months')
    expect(startsInLabel('2026-05-01', '2026-01-21')).toBe('Starts in 3 months')
  })

  it('leaves the time left to the end date from the start date on', () => {
    // The end date's urgency label ("Ends in 2 weeks") says how long is left.
    expect(startsInLabel('2026-02-01', '2026-02-01')).toBeNull()
    expect(startsInLabel('2026-02-01', '2026-03-04')).toBeNull()
    expect(startsInLabel(null, '2026-03-04')).toBeNull()
    expect(startsInLabel('2026-02-30', '2026-01-04')).toBeNull()
  })

  it('knows which statuses are closed', () => {
    expect(isClosed('completed')).toBe(true)
    expect(isClosed('cancelled')).toBe(true)
    expect(isClosed('on_hold')).toBe(false)
  })

  it('computes completion and the budget label', () => {
    expect(completionPercent(1, 3)).toBe(33)
    expect(completionPercent(0, 0)).toBe(0)
    expect(budgetUsedLabel(null)).toBe('No budget')
    expect(budgetUsedLabel(40.7)).toBeUndefined()
  })
})

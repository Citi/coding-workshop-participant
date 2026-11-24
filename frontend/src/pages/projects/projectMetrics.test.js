import { describe, expect, it } from 'vitest'
import { budgetUsedLabel, completionPercent, daysBetween, elapsedPercent, isClosed, scheduleLabel } from './projectMetrics'
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

  it('describes the time left in the schedule', () => {
    expect(scheduleLabel('2026-02-01', '2026-03-01', '2026-01-31')).toBe('Starts in 1 day')
    expect(scheduleLabel('2026-02-01', '2026-03-01', '2026-02-15')).toBe('14 days left')
    expect(scheduleLabel('2026-02-01', '2026-03-01', '2026-03-01')).toBe('Ends today')
    expect(scheduleLabel('2026-02-01', '2026-03-01', '2026-03-04')).toBe('3 days past the end date')
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

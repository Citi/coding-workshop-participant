import { describe, expect, it } from 'vitest'
import { todayIso } from '../../utils/format'
import {
  budgetTone,
  formatUpdatedAt,
  healthBreakdown,
  joinReasons,
  projectSubtitle,
  remainingLabel,
  riskSummary,
  riskTone,
  snapshotDate,
  spentOfPlanned,
  statusBreakdown,
} from './dashboardUtils'

// Intl puts a narrow no-break space before AM/PM; compare with plain spaces.
const plain = (text) => text.replace(/\s/g, ' ')

describe('formatUpdatedAt', () => {
  // Built from local date parts, so the expected wording is the same in every time zone.
  const takenAt = new Date(2026, 10, 24, 14, 5).toISOString()

  it('shows only the time for a snapshot taken today', () => {
    expect(plain(formatUpdatedAt(takenAt, new Date(2026, 10, 24, 18, 30)))).toBe('2:05 PM')
  })

  it('adds the date for an older snapshot', () => {
    expect(plain(formatUpdatedAt(takenAt, new Date(2026, 10, 25, 9, 0)))).toBe('Nov 24, 2026, 2:05 PM')
  })

  it('returns an empty string when the time is missing or invalid', () => {
    expect(formatUpdatedAt(undefined)).toBe('')
    expect(formatUpdatedAt('not a date')).toBe('')
  })
})

describe('snapshotDate', () => {
  it('is the UTC calendar date of generated_at (the API business date)', () => {
    expect(snapshotDate('2026-11-24T12:00:00+00:00')).toBe('2026-11-24')
    expect(snapshotDate('2026-11-24T23:30:00-05:00')).toBe('2026-11-25')
  })

  it('falls back to today when generated_at is missing or invalid', () => {
    expect(snapshotDate(undefined)).toBe(todayIso())
    expect(snapshotDate('garbage')).toBe(todayIso())
  })
})

describe('risk and budget tones', () => {
  it('adds up at-risk and overdue projects', () => {
    expect(riskSummary({ on_track: 4, at_risk: 3, overdue: 1 })).toEqual({ atRisk: 3, overdue: 1, total: 4 })
    expect(riskSummary()).toEqual({ atRisk: 0, overdue: 0, total: 0 })
  })

  it('is red when a project is overdue, amber when one is only at risk', () => {
    expect(riskTone({ atRisk: 3, overdue: 1 })).toBe('error')
    expect(riskTone({ atRisk: 2, overdue: 0 })).toBe('warning')
    expect(riskTone({ atRisk: 0, overdue: 0 })).toBeUndefined()
  })

  it('colours budget use above 80% amber and above 100% red', () => {
    expect(budgetTone(42)).toBeUndefined()
    expect(budgetTone(85)).toBe('warning')
    expect(budgetTone(100.1)).toBe('error')
  })
})

describe('breakdowns', () => {
  it('lists every project status in workflow order with its share of all projects', () => {
    expect(statusBreakdown({ planned: 2, active: 7, on_hold: 1, completed: 1, cancelled: 1 }, 12)).toEqual([
      { value: 'planned', color: 'default', count: 2, percent: 17 },
      { value: 'active', color: 'primary', count: 7, percent: 58 },
      { value: 'on_hold', color: 'warning', count: 1, percent: 8 },
      { value: 'completed', color: 'success', count: 1, percent: 8 },
      { value: 'cancelled', color: 'default', count: 1, percent: 8 },
    ])
  })

  it('treats missing statuses and an empty portfolio as zero', () => {
    expect(statusBreakdown({ active: 1 }, 1).map(({ count, percent }) => [count, percent])).toEqual([
      [0, 0], [1, 100], [0, 0], [0, 0], [0, 0],
    ])
    expect(statusBreakdown(undefined, 0).every((row) => row.count === 0 && row.percent === 0)).toBe(true)
  })

  it('labels each health state with its count', () => {
    expect(healthBreakdown({ on_track: 4, at_risk: 3 })).toEqual([
      { value: 'on_track', label: 'On track', color: 'success', count: 4 },
      { value: 'at_risk', label: 'At risk', color: 'warning', count: 3 },
      { value: 'overdue', label: 'Overdue', color: 'error', count: 0 },
    ])
  })
})

describe('wording', () => {
  it('describes money spent and left in whole dollars', () => {
    expect(spentOfPlanned(61000.4, 150000)).toBe('$61,000 of $150,000')
    expect(remainingLabel(89000)).toBe('$89,000 left')
    expect(remainingLabel(0)).toBe('$0 left')
    expect(remainingLabel(-6000)).toBe('$6,000 over budget')
  })

  it('describes a project by department and team size', () => {
    expect(projectSubtitle({ department: 'Sales', team_size: 3 })).toBe('Sales · 3 people')
    expect(projectSubtitle({ department: 'IT', team_size: 1 })).toBe('IT · 1 person')
  })

  it('joins health reasons into one line', () => {
    expect(joinReasons(['1 deliverable(s) overdue', '1 deliverable(s) blocked'])).toBe('1 deliverable(s) overdue; 1 deliverable(s) blocked')
    expect(joinReasons(undefined)).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, formatPercent, todayIso } from './format'
import { findOption, labelFor, optionsFor } from './labels'
import { isBlank, maxTwoDecimals, notBefore, strongPassword, validEmail } from './validators'

describe('format', () => {
  it('formats calendar dates without timezone shifts', () => {
    expect(formatDate('2026-03-01')).toBe('Mar 1, 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('garbage')).toBe('—')
  })

  it('formats money and percentages', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
    expect(formatCurrency(1234.5, { whole: true })).toBe('$1,235')
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency('abc')).toBe('—')
    expect(formatPercent(40.7)).toBe('40.7%')
    expect(formatPercent(null)).toBe('—')
  })

  it('returns today as YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('labels', () => {
  it('maps enum values to labels and colours', () => {
    expect(labelFor('project', 'on_hold')).toBe('On hold')
    expect(findOption('health', 'at_risk').color).toBe('warning')
    expect(labelFor('project', 'mystery')).toBe('mystery')
    expect(labelFor('project', null)).toBe('—')
    expect(optionsFor('role')).toContainEqual({ value: 'viewer', label: 'Viewer' })
    expect(optionsFor('unknown')).toEqual([])
  })
})

describe('validators', () => {
  it('detects blank values', () => {
    expect(isBlank('  ')).toBe(true)
    expect(isBlank([])).toBe(true)
    expect(isBlank(0)).toBe(false)
  })

  it('validates emails, dates, decimals and passwords', () => {
    expect(validEmail('a@b.co')).toBeUndefined()
    expect(validEmail('nope')).toBe('Enter a valid email address')
    expect(notBefore('start', 'the start')('2026-01-01', { start: '2026-02-01' })).toBe('Must be on or after the start')
    expect(notBefore('start', 'the start')('2026-03-01', { start: '2026-02-01' })).toBeUndefined()
    expect(maxTwoDecimals('10.123')).toBe('Use at most 2 decimal places')
    expect(maxTwoDecimals('10.12')).toBeUndefined()
    expect(strongPassword('short')).toBe('Must be at least 8 characters')
    expect(strongPassword('lettersonly')).toBe('Must contain at least one letter and one number')
    expect(strongPassword('Welcome2026')).toBeUndefined()
  })
})

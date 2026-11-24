import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, relativeDue } from './format'

const TODAY = '2026-11-24'

/** 'YYYY-MM-DD' that is `days` calendar days after TODAY. */
function inDays(days) {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}

const due = (days, options) => relativeDue(inDays(days), { today: TODAY, ...options })

describe('relativeDue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [0, 'Due today', 'soon'],
    [1, 'Due tomorrow', 'soon'],
    [2, 'Due in 2 days', 'soon'],
    [7, 'Due in 7 days', 'soon'],
    [8, 'Due in 8 days', 'later'],
    [13, 'Due in 13 days', 'later'],
    [14, 'Due in 2 weeks', 'later'],
    [20, 'Due in 2 weeks', 'later'],
    [21, 'Due in 3 weeks', 'later'],
    [59, 'Due in 8 weeks', 'later'],
    [60, 'Due in 2 months', 'later'],
    [89, 'Due in 2 months', 'later'],
    [90, 'Due in 3 months', 'later'],
    [400, 'Due in 13 months', 'later'],
  ])('%i days ahead -> "%s" (%s)', (days, label, tone) => {
    expect(due(days)).toEqual({ label, tone, days })
  })

  it('counts days in the past as overdue, singular and plural', () => {
    expect(due(-1)).toEqual({ label: '1 day overdue', tone: 'overdue', days: -1 })
    expect(due(-2)).toEqual({ label: '2 days overdue', tone: 'overdue', days: -2 })
    expect(due(-45)).toEqual({ label: '45 days overdue', tone: 'overdue', days: -45 })
  })

  it('words end dates with "Ends" (overdue wording is the same)', () => {
    expect(due(0, { kind: 'end' }).label).toBe('Ends today')
    expect(due(1, { kind: 'end' }).label).toBe('Ends tomorrow')
    expect(due(5, { kind: 'end' }).label).toBe('Ends in 5 days')
    expect(due(30, { kind: 'end' }).label).toBe('Ends in 4 weeks')
    expect(due(75, { kind: 'end' }).label).toBe('Ends in 2 months')
    expect(due(-3, { kind: 'end' })).toEqual({ label: '3 days overdue', tone: 'overdue', days: -3 })
  })

  it('words start dates with "Starts", and has no label once the start date has passed', () => {
    expect(due(0, { kind: 'start' })).toEqual({ label: 'Starts today', tone: 'soon', days: 0 })
    expect(due(1, { kind: 'start' }).label).toBe('Starts tomorrow')
    expect(due(5, { kind: 'start' }).label).toBe('Starts in 5 days')
    expect(due(14, { kind: 'start' }).label).toBe('Starts in 2 weeks')
    expect(due(90, { kind: 'start' }).label).toBe('Starts in 3 months')
    // A start in the past is not "overdue": the project has simply started.
    expect(due(-1, { kind: 'start' })).toBeNull()
    // Any other kind is worded as a due date.
    expect(due(3, { kind: 'milestone' }).label).toBe('Due in 3 days')
  })

  it('leaves the verb out for a line that already says it ("Due Dec 8, 2026 · in 2 weeks")', () => {
    expect(due(0, { verb: false })).toEqual({ label: 'today', tone: 'soon', days: 0 })
    expect(due(1, { verb: false }).label).toBe('tomorrow')
    expect(due(3, { verb: false }).label).toBe('in 3 days')
    expect(due(14, { verb: false })).toEqual({ label: 'in 2 weeks', tone: 'later', days: 14 })
    expect(due(75, { verb: false, kind: 'end' }).label).toBe('in 2 months')
    expect(due(-2, { verb: false })).toEqual({ label: '2 days overdue', tone: 'overdue', days: -2 })
  })

  it('has no label for finished work', () => {
    expect(due(-10, { done: true })).toBeNull()
    expect(due(3, { done: true, kind: 'end' })).toBeNull()
  })

  it('has no label for a missing or invalid date', () => {
    // '2026-02-30' and '2026-06-31' do not exist: the browser alone would roll them over to March / July.
    for (const bad of [null, undefined, '', 'garbage', '2026-13-01', '2026-02-30', '2026-06-31', '2025-02-29']) {
      expect(relativeDue(bad, { today: TODAY })).toBeNull()
    }
    expect(relativeDue('2026-12-01', { today: 'not-a-date' })).toBeNull()
    expect(relativeDue('2026-12-01', { today: '2026-11-31' })).toBeNull()
    expect(relativeDue('2028-02-29', { today: '2028-02-28' })).toMatchObject({ label: 'Due tomorrow', days: 1 })
  })

  it('counts whole UTC calendar days, also for timestamps', () => {
    expect(relativeDue('2026-11-25T23:59:00Z', { today: TODAY })).toMatchObject({ label: 'Due tomorrow', days: 1 })
    expect(relativeDue('2026-11-24T00:00:00Z', { today: TODAY })).toMatchObject({ label: 'Due today', days: 0 })
    // 2026-03-29 is a daylight-saving change in Europe; calendar days are not affected.
    expect(relativeDue('2026-04-01', { today: '2026-03-28' })).toMatchObject({ label: 'Due in 4 days', days: 4 })
  })

  it('compares with the explicit today, or with today in UTC by default', () => {
    expect(relativeDue('2026-12-24', { today: '2026-12-23' }).label).toBe('Due tomorrow')
    expect(relativeDue('2026-12-24', { today: '2026-12-26' }).label).toBe('2 days overdue')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-24T23:30:00Z'))
    expect(relativeDue('2026-11-25')).toEqual({ label: 'Due tomorrow', tone: 'soon', days: 1 })
    expect(relativeDue('2026-11-25', { kind: 'end' }).label).toBe('Ends tomorrow')
  })
})

describe('formatDate', () => {
  it('accepts calendar dates, timestamps and Date objects', () => {
    expect(formatDate('2026-03-01')).toBe('Mar 1, 2026')
    expect(formatDate('2026-03-01T22:15:00Z')).toBe('Mar 1, 2026')
    expect(formatDate(new Date('2026-03-01T00:00:00Z'))).toBe('Mar 1, 2026')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('2026-13-01')).toBe('—')
  })

  it('shows a dash for a calendar date that does not exist instead of the next month', () => {
    expect(formatDate('2026-02-30')).toBe('—')
    expect(formatDate('2026-04-31')).toBe('—')
    expect(formatDate('2028-02-29')).toBe('Feb 29, 2028')
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
  })
})

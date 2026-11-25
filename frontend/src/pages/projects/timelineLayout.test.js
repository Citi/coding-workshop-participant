import { describe, expect, it } from 'vitest'
import { makeProject, ZEUS } from './projectFixtures'
import {
  barPosition,
  barTone,
  buildTimeline,
  clampPercent,
  DEFAULT_MAX_TICKS,
  labelAnchor,
  MIN_AXIS_DAYS,
  MIN_BAR_PERCENT,
  monthTicks,
  projectSpan,
  timelineAxis,
  timelineText,
  toDayNumber,
  todayPosition,
  toIsoDate,
} from './timelineLayout'

const day = (iso) => toDayNumber(iso)
/** An axis from `from` (inclusive) to `to` (exclusive). */
const axisOf = (from, to) => ({ start: day(from), end: day(to), days: day(to) - day(from) })
const spanOf = (from, to = from) => ({ start: day(from), end: day(to) })
const dated = (start_date, end_date, overrides = {}) => makeProject({ start_date, end_date, ...overrides })
const labels = (ticks) => ticks.map((tick) => tick.label)

// 100 days, so a day is exactly 1% of the axis.
const HUNDRED_DAYS = axisOf('2026-01-01', '2026-04-11')

describe('dates as whole days', () => {
  it('converts calendar dates to whole UTC days and back', () => {
    expect(toDayNumber('1970-01-02')).toBe(1)
    expect(toDayNumber('2026-01-01')).toBe(20454)
    expect(toIsoDate(20454)).toBe('2026-01-01')
    expect(toIsoDate(toDayNumber('2024-02-29'))).toBe('2024-02-29')
    expect(toDayNumber('2026-01-05T10:30:00Z')).toBe(toDayNumber('2026-01-05'))
  })

  it('rejects values that are not real calendar dates', () => {
    for (const value of ['2026-02-30', '2026-13-01', '2026-1-5', '05/01/2026', 'garbage', '', null, undefined, 20260105]) {
      expect(toDayNumber(value)).toBeNull()
    }
  })

  it("reads a project's schedule, end date included", () => {
    expect(projectSpan(dated('2026-01-05', '2026-03-30'))).toEqual({ start: day('2026-01-05'), end: day('2026-03-30') })
    expect(projectSpan(dated('2026-03-02', '2026-03-02'))).toEqual({ start: day('2026-03-02'), end: day('2026-03-02') })
  })

  it('has no schedule when a date is missing, invalid or the end comes before the start', () => {
    expect(projectSpan(dated('2026-03-30', '2026-01-05'))).toBeNull()
    expect(projectSpan(dated(null, '2026-03-30'))).toBeNull()
    expect(projectSpan(dated('2026-01-05', '2026-02-30'))).toBeNull()
    expect(projectSpan(undefined)).toBeNull()
  })
})

describe('timelineAxis', () => {
  it('spans one project with 3% padding on both ends', () => {
    // 365 days -> 11 days of padding on each side.
    expect(timelineAxis([dated('2026-01-01', '2026-12-31')])).toEqual(axisOf('2025-12-21', '2027-01-12'))
  })

  it('runs from the earliest start to the latest end, whatever the order', () => {
    const projects = [dated('2026-01-01', '2026-12-31'), ZEUS] // ZEUS: Mar 1 - Sep 30, 2025
    // 671 days -> 20 days of padding.
    expect(timelineAxis(projects)).toEqual(axisOf('2025-02-09', '2027-01-21'))
    expect(timelineAxis([...projects].reverse())).toEqual(axisOf('2025-02-09', '2027-01-21'))
  })

  it('pads by at least 3 days', () => {
    // 70 days: 3% would be 2 days.
    expect(timelineAxis([dated('2026-01-01', '2026-03-11')])).toEqual(axisOf('2025-12-29', '2026-03-15'))
  })

  it('widens a short range evenly to the minimum length', () => {
    const oneDay = timelineAxis([dated('2026-03-10', '2026-03-10')])
    expect(oneDay).toEqual(axisOf('2026-02-08', '2026-04-10'))
    expect(oneDay.days).toBe(MIN_AXIS_DAYS)
    expect(timelineAxis([dated('2026-03-01', '2026-03-10')])).toEqual(axisOf('2026-02-04', '2026-04-06'))
  })

  it('leaves out projects without valid dates', () => {
    const projects = [dated('2026-01-01', '2026-12-31'), dated('garbage', '2030-01-01'), dated('2026-06-01', '2026-02-01')]
    expect(timelineAxis(projects)).toEqual(axisOf('2025-12-21', '2027-01-12'))
  })

  it('is null when no project has valid dates', () => {
    expect(timelineAxis([])).toBeNull()
    expect(timelineAxis(undefined)).toBeNull()
    expect(timelineAxis([dated(null, null)])).toBeNull()
  })
})

describe('barPosition', () => {
  it('places a span by its start and its length', () => {
    expect(barPosition(spanOf('2026-01-11', '2026-01-30'), HUNDRED_DAYS)).toEqual({ left: 10, width: 20 })
    expect(barPosition(spanOf('2026-01-01', '2026-04-10'), HUNDRED_DAYS)).toEqual({ left: 0, width: 100 })
  })

  it('clamps a span that starts before or ends after the axis', () => {
    expect(barPosition(spanOf('2025-12-01', '2026-01-20'), HUNDRED_DAYS)).toEqual({ left: 0, width: 20 })
    expect(barPosition(spanOf('2026-04-01', '2026-05-31'), HUNDRED_DAYS)).toEqual({ left: 90, width: 10 })
    expect(barPosition(spanOf('2025-01-01', '2027-01-01'), HUNDRED_DAYS)).toEqual({ left: 0, width: 100 })
  })

  it('hides a span entirely outside the axis', () => {
    expect(barPosition(spanOf('2025-12-01', '2025-12-31'), HUNDRED_DAYS)).toBeNull()
    expect(barPosition(spanOf('2026-04-11', '2026-05-01'), HUNDRED_DAYS)).toBeNull()
    expect(barPosition(null, HUNDRED_DAYS)).toBeNull()
    expect(barPosition(spanOf('2026-01-11'), null)).toBeNull()
  })

  it('gives a one-day project a minimum visible width, kept inside the axis', () => {
    expect(barPosition(spanOf('2026-01-21'), HUNDRED_DAYS)).toEqual({ left: 20, width: MIN_BAR_PERCENT })
    expect(barPosition(spanOf('2026-01-01'), HUNDRED_DAYS)).toEqual({ left: 0, width: MIN_BAR_PERCENT })
    expect(barPosition(spanOf('2026-04-10'), HUNDRED_DAYS)).toEqual({ left: 100 - MIN_BAR_PERCENT, width: MIN_BAR_PERCENT })
    expect(barPosition(spanOf('2026-01-21'), HUNDRED_DAYS, 5)).toEqual({ left: 20, width: 5 })
  })

  it('rounds to 2 decimals without the bar running past the axis', () => {
    expect(barPosition(spanOf('2026-01-02'), axisOf('2026-01-01', '2026-01-04'))).toEqual({ left: 33.33, width: 33.34 })
    expect(barPosition(spanOf('2026-01-02', '2026-01-03'), axisOf('2026-01-01', '2026-01-04'))).toEqual({ left: 33.33, width: 66.67 })
  })
})

describe('todayPosition', () => {
  it('marks the middle of today', () => {
    expect(todayPosition('2026-01-01', HUNDRED_DAYS)).toBe(0.5)
    expect(todayPosition('2026-01-11', HUNDRED_DAYS)).toBe(10.5)
    expect(todayPosition('2026-04-10', HUNDRED_DAYS)).toBe(99.5)
  })

  it('is null when today is outside the axis or unknown', () => {
    expect(todayPosition('2025-12-31', HUNDRED_DAYS)).toBeNull()
    expect(todayPosition('2026-04-11', HUNDRED_DAYS)).toBeNull()
    expect(todayPosition('garbage', HUNDRED_DAYS)).toBeNull()
    expect(todayPosition(undefined, HUNDRED_DAYS)).toBeNull()
    expect(todayPosition('2026-01-11', null)).toBeNull()
  })
})

describe('monthTicks', () => {
  it('labels the first of every month, with the year on the first label', () => {
    const ticks = monthTicks(axisOf('2025-12-15', '2026-04-20'))
    expect(ticks).toEqual([
      { date: '2026-01-01', percent: 13.49, label: 'Jan 2026' },
      { date: '2026-02-01', percent: 38.1, label: 'Feb' },
      { date: '2026-03-01', percent: 60.32, label: 'Mar' },
      { date: '2026-04-01', percent: 84.92, label: 'Apr' },
    ])
  })

  it('shows the year again on January and starts at the axis start when it is the 1st', () => {
    expect(labels(monthTicks(axisOf('2026-10-15', '2027-03-20')))).toEqual(['Nov 2026', 'Dec', 'Jan 2027', 'Feb', 'Mar'])
    expect(monthTicks(axisOf('2026-01-01', '2026-03-15'))[0]).toEqual({ date: '2026-01-01', percent: 0, label: 'Jan 2026' })
  })

  it('keeps the gridline but drops the label of a tick too close to the end of the axis', () => {
    expect(labels(monthTicks(axisOf('2026-02-10', '2026-06-10')))).toEqual(['Mar 2026', 'Apr', 'May', ''])
  })

  it('thins out many months to quarters, then years', () => {
    const twoYears = axisOf('2025-12-20', '2028-01-10')
    expect(labels(monthTicks(twoYears))).toEqual(['Jan 2026', 'Apr', 'Jul', 'Oct', 'Jan 2027', 'Apr', 'Jul', 'Oct', ''])
    expect(labels(monthTicks(twoYears, 4))).toEqual(['2026', '2027', ''])
    expect(labels(monthTicks(axisOf('2000-01-01', '2030-01-01')))).toEqual(['2000', '2005', '2010', '2015', '2020', '2025'])
  })

  it('never shows more ticks than asked for', () => {
    const axes = [axisOf('2026-01-01', '2026-03-03'), axisOf('2025-12-20', '2028-01-10'), axisOf('2019-10-16', '2027-03-19')]
    for (const axis of axes) {
      for (const maxTicks of [1, 2, 4, 6, DEFAULT_MAX_TICKS, 12]) {
        expect(monthTicks(axis, maxTicks).length).toBeLessThanOrEqual(maxTicks)
      }
    }
    // 0 (or nonsense) still shows one tick.
    expect(labels(monthTicks(axisOf('2026-01-01', '2026-12-31'), 0))).toEqual(['2026'])
  })

  it('handles ranges of centuries', () => {
    expect(labels(monthTicks(axisOf('1000-01-01', '3000-01-01'), 4))).toEqual(['1000', '1500', '2000', '2500'])
  })

  it('has no ticks without an axis', () => {
    expect(monthTicks(null)).toEqual([])
  })
})

describe('row helpers', () => {
  it('keeps labels near either end of the axis inside it', () => {
    expect(labelAnchor(2)).toBe('start')
    expect(labelAnchor(8)).toBe('middle')
    expect(labelAnchor(50)).toBe('middle')
    expect(labelAnchor(92)).toBe('middle')
    expect(labelAnchor(95)).toBe('end')
    expect(labelAnchor(15, 20)).toBe('start')
  })

  it('clamps progress to 0-100', () => {
    expect(clampPercent(40)).toBe(40)
    expect(clampPercent('62.5')).toBe(62.5)
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(140)).toBe(100)
    for (const value of [null, undefined, '', 'abc']) expect(clampPercent(value)).toBe(0)
  })

  it('colours bars by health and mutes completed or cancelled projects', () => {
    expect(barTone(makeProject({ health: 'on_track' }))).toBe('success')
    expect(barTone(makeProject({ health: 'at_risk' }))).toBe('warning')
    expect(barTone(makeProject({ health: 'overdue' }))).toBe('error')
    expect(barTone(ZEUS)).toBe('muted')
    expect(barTone(makeProject({ status: 'cancelled', health: 'at_risk' }))).toBe('muted')
    expect(barTone(makeProject({ health: null }))).toBe('muted')
    expect(barTone(makeProject({ health: 'mystery' }))).toBe('muted')
  })

  it('describes a row in words: dates, health and progress', () => {
    expect(timelineText(dated('2026-01-05', '2026-03-30', { name: 'Website revamp', health: 'at_risk', progress_percent: 40 }))).toEqual({
      dates: 'Jan 5, 2026 – Mar 30, 2026',
      state: 'At risk',
      progress: '40% complete',
      label: 'Website revamp: Jan 5, 2026 – Mar 30, 2026 · At risk · 40% complete',
    })
    expect(timelineText(ZEUS).label).toBe('Zeus Portal: Mar 1, 2025 – Sep 30, 2025 · Completed · 100% complete')
    expect(timelineText(dated('2026-03-02', '2026-03-02', { name: 'Go-live', health: 'on_track', progress_percent: 0 })).label).toBe(
      'Go-live: Mar 2, 2026 · On track · 0% complete',
    )
  })

  it('names the status when an open project has no health, and leaves out what is missing', () => {
    expect(timelineText(makeProject({ status: 'planned', health: null })).state).toBe('Planned')
    expect(timelineText(dated(null, '2026-03-30', { name: 'Mystery', status: undefined, health: null, progress_percent: null }))).toEqual({
      dates: 'Dates not set',
      state: '',
      progress: '',
      label: 'Mystery: Dates not set',
    })
  })
})

describe('buildTimeline', () => {
  const website = dated('2026-01-05', '2026-03-30', { id: 7, name: 'Website revamp', health: 'at_risk', progress_percent: 40 })
  const migration = dated('2026-03-01', '2026-06-30', { id: 8, name: 'Data migration', health: 'on_track', progress_percent: 150 })

  it('lays out every project on one axis, in the given order', () => {
    const timeline = buildTimeline([website, migration], { today: '2026-03-15' })
    // Dec 31, 2025 -> Jul 6, 2026: 187 days.
    expect(timeline.axis).toEqual(axisOf('2025-12-31', '2026-07-06'))
    expect(timeline.today).toBe(39.84)
    expect(labels(timeline.ticks)).toEqual(['Jan 2026', 'Feb', 'Mar', 'Apr', 'May', 'Jun', ''])
    expect(timeline.rows.map((row) => row.project.id)).toEqual([7, 8])
    expect(timeline.rows[0]).toMatchObject({ bar: { left: 2.67, width: 45.46 }, tone: 'warning', fillPercent: 40, state: 'At risk' })
    expect(timeline.rows[1]).toMatchObject({ bar: { left: 32.09, width: 65.24 }, tone: 'success', fillPercent: 100 })
  })

  it('keeps projects without valid dates as rows without a bar', () => {
    const timeline = buildTimeline([website, dated(null, null, { id: 9, name: 'Mystery' })], { today: '2026-03-15', maxTicks: 4 })
    expect(timeline.rows[1]).toMatchObject({ bar: null, dates: 'Dates not set' })
    expect(timeline.axis).toEqual(timelineAxis([website]))
    expect(timeline.ticks.length).toBeLessThanOrEqual(4)
  })

  it('is empty without projects', () => {
    expect(buildTimeline([], { today: '2026-03-15' })).toEqual({ axis: null, ticks: [], today: null, rows: [] })
    expect(buildTimeline(undefined)).toEqual({ axis: null, ticks: [], today: null, rows: [] })
  })
})

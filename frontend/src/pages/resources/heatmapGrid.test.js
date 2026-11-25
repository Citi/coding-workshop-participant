import { describe, expect, it } from 'vitest'
import { theme } from '../../theme'
import {
  buildHeatmapGrid,
  columnStatusText,
  HEAT_STEPS,
  HEAT_TEXT,
  heatStep,
  isOverAllocated,
  MUTED_BACKGROUND,
  MUTED_TEXT,
  OVER_ALLOCATED_BACKGROUND,
} from './heatmapGrid'
import {
  APOLLO,
  HERMES,
  MARIA,
  PRIYA,
  PRIYA_APOLLO,
  PRIYA_HERMES,
  PRIYA_ZEUS,
  RESOURCES,
  TOM,
  TOM_APOLLO,
  ZEUS,
} from './resourceFixtures'

/** GET /allocations: everyone's, sorted by project name, then person. */
const ALL_ALLOCATIONS = [PRIYA_APOLLO, TOM_APOLLO, PRIYA_HERMES, PRIYA_ZEUS]

const person = (id, fullName, total) => ({
  id,
  full_name: fullName,
  total_allocation_percent: total,
  active_project_count: 0,
  is_over_allocated: total > 100,
})
const allocation = (resource, project, percent) => ({
  id: resource.id * 100 + project.id,
  resource_id: resource.id,
  resource_name: resource.full_name,
  project_id: project.id,
  project_name: project.name,
  project_status: project.status,
  allocation_percent: percent,
})

const columnNames = (grid) => grid.columns.map((column) => column.name)
const rowNames = (grid) => grid.rows.map((row) => row.resource.full_name)
const percentsOf = (grid, name) => grid.rows.find((row) => row.resource.full_name === name).cells.map((cell) => cell.percent)
const rowOf = (grid, name) => grid.rows.find((row) => row.resource.full_name === name)

/** WCAG 2 contrast ratio of two '#rrggbb' colours. */
function contrast(first, second) {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((start) => {
      const channel = parseInt(hex.slice(start, start + 2), 16) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

describe('buildHeatmapGrid', () => {
  it('puts people in rows by name, and projects in columns: active ones first, then the others, each by name', () => {
    const grid = buildHeatmapGrid([TOM, PRIYA, MARIA], ALL_ALLOCATIONS)
    expect(rowNames(grid)).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
    expect(columnNames(grid)).toEqual(['Apollo CRM', 'Zeus ERP', 'Hermes Portal'])
    expect(grid.columns).toEqual([
      { id: APOLLO.id, name: 'Apollo CRM', status: 'active', counted: true },
      { id: ZEUS.id, name: 'Zeus ERP', status: 'active', counted: true },
      { id: HERMES.id, name: 'Hermes Portal', status: 'planned', counted: false },
    ])
  })

  it('fills each cell with the allocation % (or null), in column order', () => {
    const grid = buildHeatmapGrid(RESOURCES, ALL_ALLOCATIONS)
    expect(percentsOf(grid, 'Priya Shah')).toEqual([60, 60, 30])
    expect(percentsOf(grid, 'Tom Lee')).toEqual([40, null, null])
    expect(rowOf(grid, 'Priya Shah').cells).toEqual([
      { projectId: APOLLO.id, percent: 60, counted: true },
      { projectId: ZEUS.id, percent: 60, counted: true },
      { projectId: HERMES.id, percent: 30, counted: false },
    ])
  })

  it("totals only active projects, which equals every person's total_allocation_percent from the API", () => {
    const grid = buildHeatmapGrid(RESOURCES, ALL_ALLOCATIONS)
    // Priya: Apollo 60 + Zeus 60; her 30% on the planned Hermes Portal does not count.
    expect(rowOf(grid, 'Priya Shah')).toMatchObject({ total: 120, overAllocated: true, consistent: true })
    expect(rowOf(grid, 'Tom Lee')).toMatchObject({ total: 40, overAllocated: false, consistent: true })
    grid.rows.forEach((row) => {
      expect(row.total).toBe(row.resource.total_allocation_percent)
      expect(row.overAllocated).toBe(row.resource.is_over_allocated)
    })
    expect(grid.consistent).toBe(true)
  })

  it('applies the API rule: over-allocated above 100%, exactly 100% is fine', () => {
    expect(isOverAllocated(100)).toBe(false)
    expect(isOverAllocated(101)).toBe(true)
    const full = person(10, 'Full Time', 100)
    const over = person(11, 'Over Time', 101)
    const grid = buildHeatmapGrid(
      [full, over],
      [allocation(full, APOLLO, 50), allocation(full, ZEUS, 50), allocation(over, APOLLO, 51), allocation(over, ZEUS, 50)],
    )
    expect(rowOf(grid, 'Full Time')).toMatchObject({ total: 100, overAllocated: false, consistent: true })
    expect(rowOf(grid, 'Over Time')).toMatchObject({ total: 101, overAllocated: true, consistent: true })
  })

  it('counts no project that is not active, whatever its status, and puts them after the active ones', () => {
    const statuses = ['planned', 'on_hold', 'completed', 'cancelled']
    const others = statuses.map((status, index) => ({ id: 20 + index, name: `Project ${String.fromCharCode(65 + index)}`, status }))
    const busy = person(12, 'Busy Bee', 10)
    const grid = buildHeatmapGrid(
      [busy],
      [...others.map((project) => allocation(busy, project, 100)), allocation(busy, { id: 30, name: 'Zulu', status: 'active' }, 10)],
    )
    expect(columnNames(grid)).toEqual(['Zulu', 'Project A', 'Project B', 'Project C', 'Project D'])
    expect(grid.columns.map((column) => column.counted)).toEqual([true, false, false, false, false])
    expect(rowOf(grid, 'Busy Bee')).toMatchObject({ total: 10, overAllocated: false, consistent: true })
  })

  it('keeps people without allocations, with empty cells and a 0% total', () => {
    const grid = buildHeatmapGrid(RESOURCES, ALL_ALLOCATIONS)
    expect(rowOf(grid, 'Maria Garcia')).toMatchObject({ total: 0, overAllocated: false, consistent: true })
    expect(percentsOf(grid, 'Maria Garcia')).toEqual([null, null, null])

    const nobodyAllocated = buildHeatmapGrid([MARIA], ALL_ALLOCATIONS)
    expect(nobodyAllocated.columns).toEqual([])
    expect(nobodyAllocated.rows).toEqual([{ resource: MARIA, cells: [], total: 0, overAllocated: false, consistent: true }])
  })

  it("respects the page's filters: only the listed people, and only the projects they work on", () => {
    // ?over_allocated=true lists only Priya: Tom's allocation is left out.
    const priyaOnly = buildHeatmapGrid([PRIYA], ALL_ALLOCATIONS)
    expect(rowNames(priyaOnly)).toEqual(['Priya Shah'])
    expect(columnNames(priyaOnly)).toEqual(['Apollo CRM', 'Zeus ERP', 'Hermes Portal'])
    expect(percentsOf(priyaOnly, 'Priya Shah')).toEqual([60, 60, 30])

    // ?search=tom: only the project Tom works on gets a column.
    const tomOnly = buildHeatmapGrid([TOM], ALL_ALLOCATIONS)
    expect(columnNames(tomOnly)).toEqual(['Apollo CRM'])
    expect(rowOf(tomOnly, 'Tom Lee')).toMatchObject({ total: 40, consistent: true })
  })

  it('flags a total that does not match the API (the allocations changed between the two requests)', () => {
    const stalePriya = { ...PRIYA, total_allocation_percent: 60, is_over_allocated: false }
    const grid = buildHeatmapGrid([stalePriya, TOM], ALL_ALLOCATIONS)
    expect(rowOf(grid, 'Priya Shah')).toMatchObject({ total: 120, overAllocated: true, consistent: false })
    expect(rowOf(grid, 'Tom Lee').consistent).toBe(true)
    expect(grid.consistent).toBe(false)
  })

  it('sorts names case-insensitively, reading numbers as numbers', () => {
    const anna = person(1, 'anna Berg', 0)
    const bob = person(2, 'Bob Stone', 0)
    const phase10 = { id: 41, name: 'Phase 10', status: 'active' }
    const phase2 = { id: 42, name: 'phase 2', status: 'active' }
    const grid = buildHeatmapGrid([bob, anna], [allocation(bob, phase10, 10), allocation(anna, phase2, 10)])
    expect(rowNames(grid)).toEqual(['anna Berg', 'Bob Stone'])
    expect(columnNames(grid)).toEqual(['phase 2', 'Phase 10'])
  })

  it('orders namesakes by id (rows and columns never swap between loads); a missing name or API total is empty / 0', () => {
    const laterSam = person(7, 'Sam Lee', 0)
    const earlierSam = person(3, 'sam lee', 0)
    const unnamed = { ...person(9, null, 0), total_allocation_percent: undefined }
    const atlasB = { id: 52, name: 'Atlas', status: 'active' }
    const atlasA = { id: 51, name: 'atlas', status: 'active' }
    const allocations = [allocation(laterSam, atlasB, 10), allocation(earlierSam, atlasA, 20)]
    const grid = buildHeatmapGrid([laterSam, unnamed, earlierSam], allocations)
    // An empty name sorts first; the two Sams tie case-insensitively and keep id order.
    expect(grid.rows.map((row) => row.resource.id)).toEqual([9, 3, 7])
    expect(grid.columns.map((column) => column.id)).toEqual([51, 52])
    expect(grid.rows[0]).toMatchObject({ total: 0, consistent: true })
    // The same result whatever order the API listed them in.
    const reversed = buildHeatmapGrid([earlierSam, unnamed, laterSam], [...allocations].reverse())
    expect(reversed.rows.map((row) => row.resource.id)).toEqual([9, 3, 7])
    expect(reversed.columns.map((column) => column.id)).toEqual([51, 52])
  })

  it('treats missing lists as empty', () => {
    expect(buildHeatmapGrid(undefined, undefined)).toEqual({ columns: [], rows: [], consistent: true })
    expect(buildHeatmapGrid([TOM], null).rows[0]).toMatchObject({ cells: [], total: 0, consistent: false })
  })
})

describe('columnStatusText', () => {
  it('names the status, and says when a project does not count', () => {
    expect(columnStatusText({ status: 'active', counted: true })).toBe('Active')
    expect(columnStatusText({ status: 'planned', counted: false })).toBe('Planned – not counted')
    expect(columnStatusText({ status: 'on_hold', counted: false })).toBe('On hold – not counted')
    expect(columnStatusText({ status: 'cancelled', counted: false })).toBe('Cancelled – not counted')
  })
})

describe('heat map shading', () => {
  it('has one step per quarter of full time', () => {
    expect([1, 25, 26, 50, 51, 75, 76, 100].map((percent) => heatStep(percent).label)).toEqual([
      '1–25%',
      '1–25%',
      '26–50%',
      '26–50%',
      '51–75%',
      '51–75%',
      '76–100%',
      '76–100%',
    ])
    expect(heatStep(150)).toBe(HEAT_STEPS[3])
    expect([null, undefined, 0, Number.NaN].map(heatStep)).toEqual([null, null, null, null])
  })

  it('gets darker as the percentage grows', () => {
    const againstWhite = HEAT_STEPS.map((step) => contrast(step.background, '#ffffff'))
    againstWhite.slice(1).forEach((ratio, index) => expect(ratio).toBeGreaterThan(againstWhite[index]))
  })

  it('keeps every text at least 4.5:1 against its background (WCAG AA)', () => {
    HEAT_STEPS.forEach((step) => expect(contrast(HEAT_TEXT, step.background)).toBeGreaterThanOrEqual(4.5))
    expect(contrast(MUTED_TEXT, MUTED_BACKGROUND)).toBeGreaterThanOrEqual(4.5)
    // Over-allocated totals: the theme's error red on the light red tint.
    expect(contrast(theme.palette.error.main, OVER_ALLOCATED_BACKGROUND)).toBeGreaterThanOrEqual(4.5)
    // Project links in the greyed-out column headers.
    expect(contrast(theme.palette.primary.main, MUTED_BACKGROUND)).toBeGreaterThanOrEqual(4.5)
  })
})

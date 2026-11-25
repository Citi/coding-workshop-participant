import { screen } from '@testing-library/react'
import { decomposeColor, getContrastRatio, recomposeColor } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders'
import { theme } from '../../theme'
import DependencyList from './DependencyList'
import { DATA_AUDIT, INTERVIEWS, VENDOR } from './deliverableFixtures'

// Due dates are worded relative to today (UTC), so the tests run on a fixed day: Mar 4, 2026.
const TODAY = new Date('2026-03-04T12:00:00Z')

const related = ({ id, name, status, due_date, project_id, project_name }, depth) => ({ id, name, status, due_date, project_id, project_name, depth })
// Not completed, so blockers: 53 days overdue, due in 2 days and due in 9 months; then a completed one.
const OVERDUE = related(VENDOR, 2)
const SOON = related({ ...DATA_AUDIT, id: 20, name: 'Test plan', status: 'not_started', due_date: '2026-03-06' }, 1)
const LATER = related(DATA_AUDIT, 1)
const DONE = related(INTERVIEWS, 1)

function renderList(props) {
  renderWithProviders(<DependencyList items={[OVERDUE, SOON, LATER, DONE]} label="Dependency chain" onOpen={vi.fn()} {...props} />)
}

/** The line under a related deliverable's name: project, due date, urgency and level. */
const summary = (name) => screen.getByText(name).nextElementSibling

/** `color` (possibly translucent) painted over the opaque `background`. */
function paint(color, background) {
  const [red, green, blue, opacity = 1] = decomposeColor(color).values
  const base = decomposeColor(background).values
  const values = [red, green, blue].map((value, index) => Math.round(value * opacity + base[index] * (1 - opacity)))
  return recomposeColor({ type: 'rgb', values })
}

describe('DependencyList', () => {
  beforeEach(() => {
    // Only Date is faked: timers stay real for Testing Library.
    vi.setSystemTime(TODAY)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('colours the urgency label in its line like everywhere else, at the size of the line', () => {
    renderList({ showDepth: true, highlightBlockers: true })
    expect(summary('Vendor contract')).toHaveTextContent(/^Zeus ERP · Due Jan 10, 2026 · 53 days overdue · Level 2$/)

    const overdue = screen.getByText('53 days overdue')
    expect(overdue).toHaveStyle({ color: theme.palette.error.main, fontWeight: 600 })
    expect(screen.getByText('in 2 days')).toHaveStyle({ color: theme.palette.warning.dark, fontWeight: 600 })
    expect(screen.getByText('in 9 months')).toHaveStyle({ color: theme.palette.text.secondary })
    // Part of the line's text, not a smaller caption squeezed into it.
    expect(overdue).toHaveClass('MuiTypography-inherit')
  })

  it('keeps each name beside its indent arrow in a narrow dialog: only the chips wrap below', () => {
    renderList({ showDepth: true, highlightBlockers: true })
    const text = screen.getByText('Vendor contract').closest('.MuiListItemText-root')
    // Sized from 160px rather than from its whole line, the text does not drop below the arrow.
    expect(text).toHaveStyle({ flexGrow: '1', flexShrink: '1', flexBasis: '160px', minWidth: '160px' })
    expect(text.previousElementSibling).toHaveAttribute('data-testid', 'SubdirectoryArrowRightIcon')
    expect(getComputedStyle(text.parentElement).flexWrap).toBe('wrap')
  })

  it('reads as one sentence to screen readers, with the label in its place', () => {
    renderList({ showDepth: true })
    expect(screen.getByRole('button', { name: /Vendor contract.*Zeus ERP · Due Jan 10, 2026 · 53 days overdue · Level 2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test plan.*Zeus ERP · Due Mar 6, 2026 · in 2 days · Level 1 \(direct\)/ })).toBeInTheDocument()
  })

  it('says "Due" once: the date carries it, the urgency label does not repeat it', () => {
    renderList({ showDepth: true })
    expect(summary('Test plan')).toHaveTextContent(/^Zeus ERP · Due Mar 6, 2026 · in 2 days · Level 1 \(direct\)$/)
    expect(summary('Data audit')).toHaveTextContent(/^Zeus ERP · Due [A-Z][a-z]{2} \d{1,2}, \d{4} · in 9 months · Level 1 \(direct\)$/)
    ;['Vendor contract', 'Test plan', 'Data audit', 'Stakeholder interviews'].forEach((name) => {
      expect(summary(name).textContent.match(/Due/g)).toHaveLength(1)
    })
  })

  it('has no urgency for a completed deliverable, and no empty separator either', () => {
    renderList({ showDepth: true })
    expect(summary('Stakeholder interviews')).toHaveTextContent(/^Apollo CRM · Due Feb 1, 2026 · Level 1 \(direct\)$/)
    expect(screen.queryByText('31 days overdue')).not.toBeInTheDocument()
  })

  it('leaves the level out of lists without depth', () => {
    renderList()
    expect(summary('Vendor contract')).toHaveTextContent(/^Zeus ERP · Due Jan 10, 2026 · 53 days overdue$/)
    expect(summary('Stakeholder interviews')).toHaveTextContent(/^Apollo CRM · Due Feb 1, 2026$/)
  })

  it('keeps every urgency label at 4.5:1 contrast or more on the amber blocker rows', () => {
    renderList({ highlightBlockers: true })
    const paper = theme.palette.background.paper
    ;['53 days overdue', 'in 2 days', 'in 9 months'].forEach((text) => {
      const label = screen.getByText(text)
      const row = paint(getComputedStyle(label.closest('[role="button"]')).backgroundColor, paper)
      expect(row).not.toBe(paint(paper, paper))
      expect(getContrastRatio(paint(getComputedStyle(label).color, row), row)).toBeGreaterThanOrEqual(4.5)
    })
  })
})

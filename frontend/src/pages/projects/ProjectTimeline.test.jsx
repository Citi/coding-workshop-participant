import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useParams } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders'
import { makeProject, ZEUS } from './projectFixtures'
import ProjectTimeline from './ProjectTimeline'

// Window width seen by react-responsive (useIsMobile and the timeline's own breakpoints).
const viewport = vi.hoisted(() => ({ width: 1366 }))
vi.mock('react-responsive', () => ({ useMediaQuery: ({ maxWidth }) => viewport.width <= maxWidth }))
// "Today" when the page passes none.
vi.mock('../../utils/format', async (importOriginal) => ({ ...(await importOriginal()), todayIso: () => '2026-03-15' }))

const WEBSITE = makeProject({
  id: 7,
  name: 'Website revamp',
  start_date: '2026-01-05',
  end_date: '2026-03-30',
  health: 'at_risk',
  progress_percent: 40,
})
const MIGRATION = makeProject({
  id: 8,
  name: 'Data migration',
  start_date: '2026-03-01',
  end_date: '2026-06-30',
  health: 'on_track',
  progress_percent: 10,
})
const LAUNCH = makeProject({
  id: 9,
  name: 'Launch campaign',
  start_date: '2026-01-10',
  end_date: '2026-02-28',
  health: 'overdue',
  progress_percent: 75,
})

function DetailRoute() {
  const { projectId } = useParams()
  return <p>Detail of project {projectId}</p>
}

function renderTimeline(props, width = 1366) {
  viewport.width = width
  return renderWithProviders(<ProjectTimeline today="2026-03-15" {...props} />, {
    route: '/projects?view=timeline',
    path: '/projects',
    extraRoutes: [{ path: '/projects/:projectId', element: <DetailRoute /> }],
  })
}

const timelineList = () => screen.getByRole('list', { name: 'Project timeline' })
const rows = () => within(timelineList()).getAllByRole('listitem')
const rowOf = (name) => screen.getByText(name).closest('li')
const barOf = (name) => within(rowOf(name)).getByTestId('timeline-bar')
const detailsOf = (name) => within(rowOf(name)).getByTestId('timeline-details')
const tickLabels = () => screen.queryAllByTestId('timeline-tick').map((tick) => tick.textContent)
const leftOf = (element) => parseFloat(element.style.left)
const widthOf = (element) => parseFloat(element.style.width)

describe('ProjectTimeline', () => {
  it('shows one row per project, in order, each linking to its project and stating dates, health and progress', () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION, ZEUS] })

    expect(rows()).toHaveLength(3)
    expect(rows().map((row) => within(row).getByRole('link').textContent)).toEqual(['Website revamp', 'Data migration', 'Zeus Portal'])
    expect(screen.getByRole('link', { name: 'Website revamp: Jan 5, 2026 – Mar 30, 2026 · At risk · 40% complete' })).toHaveAttribute(
      'href',
      '/projects/7',
    )
    expect(screen.getByRole('link', { name: 'Data migration: Mar 1, 2026 – Jun 30, 2026 · On track · 10% complete' })).toHaveAttribute(
      'href',
      '/projects/8',
    )
    // Completed and cancelled projects have no health: their status is named instead.
    expect(screen.getByRole('link', { name: 'Zeus Portal: Mar 1, 2025 – Sep 30, 2025 · Completed · 100% complete' })).toHaveAttribute(
      'href',
      '/projects/2',
    )

    // The same words are visible next to the bar; screen readers get them once, as the link's name.
    const details = detailsOf('Website revamp')
    expect(details).toHaveTextContent('Jan 5, 2026 – Mar 30, 2026 At risk · 40% complete')
    expect(details).toHaveAttribute('aria-hidden', 'true')
    expect(detailsOf('Zeus Portal')).toHaveTextContent('Mar 1, 2025 – Sep 30, 2025 Completed · 100% complete')
    expect(within(rowOf('Website revamp')).getByTestId('timeline-track')).toHaveAttribute('aria-hidden', 'true')
  })

  it('opens a project from its row', async () => {
    const user = userEvent.setup()
    renderTimeline({ projects: [WEBSITE, MIGRATION] })
    await user.click(screen.getByRole('link', { name: /^Data migration:/ }))
    expect(await screen.findByText('Detail of project 8')).toBeInTheDocument()
  })

  it('rings the whole row on keyboard focus, like a list row, and opens the project with Enter', async () => {
    const user = userEvent.setup()
    renderTimeline({ projects: [WEBSITE, MIGRATION] })
    const link = screen.getByRole('link', { name: /^Website revamp:/ })
    expect(getComputedStyle(link, '::after').outlineStyle).not.toBe('solid')

    await user.tab()
    expect(link).toHaveFocus()
    // The ring is drawn by the ::after that covers the row (the row is what opens the project), not
    // by the browser around the name alone.
    expect(getComputedStyle(link).outlineStyle).toBe('none')
    const ring = getComputedStyle(link, '::after')
    expect(ring.position).toBe('absolute')
    expect(ring.outlineStyle).toBe('solid')
    expect(ring.outlineWidth).toBe('2px')
    expect(ring.outlineColor).toBe('rgb(29, 78, 216)')
    expect(getComputedStyle(rowOf('Website revamp')).position).toBe('relative')

    await user.keyboard('{Enter}')
    expect(await screen.findByText('Detail of project 7')).toBeInTheDocument()
  })

  it('places every bar on one shared axis from its start to its end date', () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION] })
    // Axis: Dec 31, 2025 - Jul 6, 2026 (the projects' range plus 5 days on each side) = 187 days.
    expect(barOf('Website revamp')).toHaveStyle({ left: '2.67%', width: '45.46%' })
    expect(barOf('Data migration')).toHaveStyle({ left: '32.09%', width: '65.24%' })
  })

  it('colours bars by health, fills the completed share darker and mutes closed projects', () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION, LAUNCH, ZEUS] })

    expect(barOf('Website revamp')).toHaveAttribute('data-tone', 'warning')
    expect(barOf('Data migration')).toHaveAttribute('data-tone', 'success')
    expect(barOf('Launch campaign')).toHaveAttribute('data-tone', 'error')
    expect(barOf('Zeus Portal')).toHaveAttribute('data-tone', 'muted')

    // theme.palette.warning.main (#b45309): the full colour for progress, a lighter step for the rest.
    const bar = barOf('Website revamp')
    const fill = within(bar).getByTestId('timeline-progress')
    expect(fill).toHaveStyle({ width: '40%' })
    expect(getComputedStyle(fill).backgroundColor).toBe('rgb(180, 83, 9)')
    expect(getComputedStyle(bar).backgroundColor).toBe('rgba(180, 83, 9, 0.3)')
    expect(within(barOf('Zeus Portal')).getByTestId('timeline-progress')).toHaveStyle({ width: '100%' })

    // Never colour alone: every row names its health (or status) in words.
    expect(detailsOf('Website revamp')).toHaveTextContent('At risk')
    expect(detailsOf('Data migration')).toHaveTextContent('On track')
    expect(detailsOf('Launch campaign')).toHaveTextContent('Overdue')
    expect(detailsOf('Zeus Portal')).toHaveTextContent('Completed')

    const legend = within(screen.getByRole('list', { name: 'Legend' }))
    expect(legend.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'On track',
      'At risk',
      'Overdue',
      'Completed or cancelled',
      'Darker fill shows progress',
      'Today',
    ])
  })

  it('labels the months along the axis', () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION] })
    // Jul 1 is too close to the end of the axis for a label.
    expect(tickLabels()).toEqual(['Jan 2026', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
    expect(screen.getAllByTestId('timeline-tick')[1]).toHaveStyle({ left: '17.11%' })
    expect(screen.getByTestId('timeline-axis').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('marks today with a labelled line across the rows when it falls on the axis', () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION] })
    const label = screen.getByTestId('timeline-today-label')
    expect(label).toHaveTextContent('Today')
    expect(label).toHaveStyle({ left: '39.84%', transform: 'translateX(-50%)' })
    for (const row of rows()) {
      expect(within(row).getByTestId('timeline-today')).toHaveStyle({ left: '39.84%' })
    }
  })

  it("uses today's date unless the page passes one", () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION], today: undefined })
    expect(screen.getByTestId('timeline-today-label')).toHaveStyle({ left: '39.84%' })
  })

  it('keeps the today label inside the chart near either end', () => {
    const { unmount } = renderTimeline({ projects: [WEBSITE, MIGRATION], today: '2026-01-01' })
    expect(screen.getByTestId('timeline-today-label')).toHaveStyle({ left: '0.8%', transform: 'none' })
    unmount()
    renderTimeline({ projects: [WEBSITE, MIGRATION], today: '2026-07-05' })
    expect(screen.getByTestId('timeline-today-label')).toHaveStyle({ left: '99.73%', transform: 'translateX(-100%)' })
  })

  it('leaves out the today marker when today is outside the axis', () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION], today: '2026-11-24' })
    expect(screen.queryByTestId('timeline-today-label')).not.toBeInTheDocument()
    expect(screen.queryByTestId('timeline-today')).not.toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('stretches the axis to a project far from the others and thins out the labels over many months', () => {
    const legacy = makeProject({ id: 3, name: 'Legacy shutdown', start_date: '2020-01-01', end_date: '2020-06-30', health: 'overdue' })
    const annual = makeProject({ id: 4, name: 'Annual plan', start_date: '2026-01-01', end_date: '2026-12-31', health: 'on_track' })
    const { unmount } = renderTimeline({ projects: [annual, legacy] })

    // Seven years on one axis: a label per year instead of 89 months.
    expect(tickLabels()).toEqual(['2020', '2021', '2022', '2023', '2024', '2025', '2026'])
    const [early, late] = [barOf('Legacy shutdown'), barOf('Annual plan')]
    expect(leftOf(early)).toBeGreaterThan(0)
    expect(leftOf(early) + widthOf(early)).toBeLessThan(leftOf(late))
    expect(leftOf(late) + widthOf(late)).toBeLessThan(100)
    unmount()

    // A phone has room for fewer labels.
    renderTimeline({ projects: [annual, legacy] }, 375)
    expect(tickLabels()).toEqual(['2020', '2022', '2024', '2026'])
  })

  it('keeps a project without valid dates in the list, without a bar or a say in the axis', () => {
    const mystery = makeProject({ id: 10, name: 'Mystery', start_date: null, end_date: '2026-02-30' })
    renderTimeline({ projects: [WEBSITE, mystery] })

    expect(rows()).toHaveLength(2)
    expect(within(rowOf('Mystery')).queryByTestId('timeline-bar')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mystery: Dates not set · At risk · 40% complete' })).toBeInTheDocument()
    // The axis follows Website revamp alone: Jan 2 - Apr 3, 2026 (91 days).
    expect(barOf('Website revamp')).toHaveStyle({ left: '3.3%', width: '93.4%' })
  })

  it('states only what is known about a project', () => {
    const sketch = makeProject({ id: 12, name: 'Sketch', status: undefined, health: null, progress_percent: null })
    const pilot = makeProject({ id: 13, name: 'Pilot', health: 'on_track', progress_percent: null })
    renderTimeline({ projects: [sketch, pilot] })

    expect(screen.getByRole('link', { name: 'Sketch: Jan 1, 2026 – Dec 31, 2026' })).toBeInTheDocument()
    expect(detailsOf('Sketch')).toHaveTextContent(/^Jan 1, 2026 – Dec 31, 2026$/)
    expect(barOf('Sketch')).toHaveAttribute('data-tone', 'muted')
    expect(within(barOf('Sketch')).getByTestId('timeline-progress')).toHaveStyle({ width: '0%' })
    expect(screen.getByRole('link', { name: 'Pilot: Jan 1, 2026 – Dec 31, 2026 · On track' })).toBeInTheDocument()
    expect(detailsOf('Pilot')).toHaveTextContent(/^Jan 1, 2026 – Dec 31, 2026 On track$/)
  })

  it('gives a one-day project a bar wide enough to see', () => {
    const goLive = makeProject({ id: 11, name: 'Go-live', start_date: '2026-03-02', end_date: '2026-03-02', health: 'on_track', progress_percent: 0 })
    renderTimeline({ projects: [WEBSITE, MIGRATION, goLive] })
    expect(barOf('Go-live')).toHaveStyle({ left: '32.62%', width: '1.5%' })
    expect(screen.getByRole('link', { name: 'Go-live: Mar 2, 2026 · On track · 0% complete' })).toBeInTheDocument()
  })

  it('puts names in a column beside the bars on wide screens and above them on phones', () => {
    const { unmount } = renderTimeline({ projects: [WEBSITE] })
    expect(getComputedStyle(rowOf('Website revamp')).gridTemplateColumns).toBe('260px minmax(0px, 1fr)')
    unmount()

    // Below 1200px the side menu leaves less room, so the name column narrows.
    renderTimeline({ projects: [WEBSITE] }, 1024)
    expect(getComputedStyle(rowOf('Website revamp')).gridTemplateColumns).toBe('200px minmax(0px, 1fr)')
  })

  it('stacks each name above its bar on phones', () => {
    renderTimeline({ projects: [WEBSITE, MIGRATION] }, 375)
    expect(getComputedStyle(rowOf('Website revamp')).gridTemplateColumns).toBe('minmax(0px, 1fr)')
    expect(screen.getByRole('link', { name: /^Website revamp:/ })).toBeInTheDocument()
    expect(tickLabels()).toEqual(['Jan 2026', 'Mar', 'May'])
  })

  it('names the list as the page asks', () => {
    renderTimeline({ projects: [WEBSITE], ariaLabel: 'Projects' })
    expect(screen.getByRole('list', { name: 'Projects' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no projects', () => {
    const { unmount } = renderTimeline({ projects: [] })
    expect(screen.getByText('No projects to show')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    unmount()

    renderTimeline({
      projects: undefined,
      emptyTitle: 'No matching projects',
      emptyMessage: 'No project matches these filters. Try changing or clearing them.',
      emptyAction: <button type="button">Clear filters</button>,
    })
    expect(screen.getByText('No matching projects')).toBeInTheDocument()
    expect(screen.getByText('No project matches these filters. Try changing or clearing them.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })
})

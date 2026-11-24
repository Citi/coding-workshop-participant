import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders'
import { theme } from '../../theme'
import { APOLLO, makeProject, ZEUS } from './projectFixtures'
import ProjectOverview from './ProjectOverview'

// A fixed "today": half of APOLLO's 2026 schedule has elapsed.
vi.mock('../../utils/format', async (importOriginal) => ({ ...(await importOriginal()), todayIso: () => '2026-07-02' }))

const card = (title) => screen.getByRole('heading', { level: 2, name: title }).parentElement
const healthAlert = (title) => screen.getByText(title).closest('[role="alert"]')
/** The value of the Schedule card's "End date": the date, with how close it is underneath. */
const endDate = () => within(card('Schedule')).getByText('End date').nextElementSibling

describe('ProjectOverview', () => {
  it('explains an at-risk project and summarises progress, key deliverables, schedule and budget', () => {
    renderWithProviders(<ProjectOverview project={APOLLO} />)

    const health = healthAlert('Health: At risk')
    expect(health).toHaveClass('MuiAlert-colorWarning')
    expect(within(health).getByRole('listitem')).toHaveTextContent('1 deliverable(s) overdue')

    const progress = card('Progress')
    expect(within(progress).getByRole('progressbar', { name: '40%' })).toBeInTheDocument()
    expect(within(progress).getByText('2 of 5 deliverables complete')).toBeInTheDocument()
    expect(within(progress).getByText('1 overdue')).toBeInTheDocument()

    const key = card('Key deliverables')
    expect(within(key).getByText('1 of 2')).toBeInTheDocument()
    expect(within(key).getByText('key deliverables completed')).toBeInTheDocument()
    expect(within(key).getByRole('progressbar', { name: '50%' })).toBeInTheDocument()

    const schedule = card('Schedule')
    expect(within(schedule).getByText('Jan 1, 2026')).toBeInTheDocument()
    expect(within(schedule).getByText('Dec 31, 2026')).toBeInTheDocument()
    expect(endDate()).toHaveTextContent('Dec 31, 2026 Ends in 6 months')
    expect(within(schedule).getByText('Time elapsed')).toBeInTheDocument()
    expect(within(schedule).getByRole('progressbar', { name: '50%' })).toBeInTheDocument()
    // The end date already says how long is left; the bar does not repeat it in other words.
    expect(schedule).not.toHaveTextContent('days left')
    expect(schedule).not.toHaveTextContent('Starts')

    const budget = card('Budget')
    expect(within(budget).getByRole('progressbar', { name: '40.7%' })).toBeInTheDocument()
    expect(within(budget).getByText('$150,000.00')).toBeInTheDocument()
    expect(within(budget).getByText('$61,000.00')).toBeInTheDocument()
    expect(within(budget).getByText('$89,000.00')).toBeInTheDocument()
    expect(within(budget).queryByText(/Over budget/)).not.toBeInTheDocument()
  })

  it('confirms a project that is on track', () => {
    renderWithProviders(<ProjectOverview project={makeProject({ health: 'on_track', health_reasons: [], deliverables_overdue: 0 })} />)
    const health = healthAlert('Health: On track')
    expect(health).toHaveClass('MuiAlert-colorSuccess')
    expect(health).toHaveTextContent('No risks found')
    expect(within(card('Progress')).queryByText(/overdue|blocked/)).not.toBeInTheDocument()
  })

  it('flags an overdue project and lists every reason', () => {
    const project = makeProject({
      end_date: '2026-06-30',
      health: 'overdue',
      health_reasons: ['End date 2026-06-30 has passed', '2 deliverable(s) blocked'],
      deliverables_blocked: 2,
    })
    renderWithProviders(<ProjectOverview project={project} />)
    const health = healthAlert('Health: Overdue')
    expect(health).toHaveClass('MuiAlert-colorError')
    expect(within(health).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'End date 2026-06-30 has passed',
      '2 deliverable(s) blocked',
    ])
    expect(within(card('Progress')).getByText('1 overdue · 2 blocked')).toBeInTheDocument()
    expect(endDate()).toHaveTextContent('Jun 30, 2026 2 days overdue')
    expect(within(card('Schedule')).getByText('2 days overdue')).toHaveStyle({ color: theme.palette.error.main })
    expect(card('Schedule')).not.toHaveTextContent('past the end date')
  })

  it('counts down to the start of a project that has not started yet', () => {
    renderWithProviders(
      <ProjectOverview project={makeProject({ status: 'planned', start_date: '2026-07-10', health: 'on_track', health_reasons: [] })} />,
    )
    const schedule = card('Schedule')
    expect(within(schedule).getByRole('progressbar', { name: '0%' })).toBeInTheDocument()
    expect(within(schedule).getByText('Starts in 8 days')).toBeInTheDocument()
    expect(endDate()).toHaveTextContent('Dec 31, 2026 Ends in 6 months')
  })

  it('words a start that is a day or weeks away like every other date label', () => {
    const { unmount } = renderWithProviders(
      <ProjectOverview project={makeProject({ status: 'planned', start_date: '2026-07-03', health: 'on_track', health_reasons: [] })} />,
    )
    expect(within(card('Schedule')).getByText('Starts tomorrow')).toBeInTheDocument()
    unmount()
    renderWithProviders(
      <ProjectOverview project={makeProject({ status: 'planned', start_date: '2026-07-22', health: 'on_track', health_reasons: [] })} />,
    )
    expect(within(card('Schedule')).getByText('Starts in 2 weeks')).toBeInTheDocument()
  })

  it('stops the countdown on the start date, when the end date takes over', () => {
    renderWithProviders(
      <ProjectOverview project={makeProject({ status: 'planned', start_date: '2026-07-02', health: 'on_track', health_reasons: [] })} />,
    )
    const schedule = card('Schedule')
    expect(within(schedule).getByRole('progressbar', { name: '0%' })).toBeInTheDocument()
    expect(schedule).not.toHaveTextContent('Starts')
    expect(endDate()).toHaveTextContent('Dec 31, 2026 Ends in 6 months')
  })

  it('shows only the end date of a cancelled project, which is no longer due', () => {
    renderWithProviders(<ProjectOverview project={makeProject({ status: 'cancelled', end_date: '2026-06-30', health: null, health_reasons: [] })} />)
    expect(screen.getByText('Health is not tracked for cancelled projects.')).toBeInTheDocument()
    expect(endDate()).toHaveTextContent(/^Jun 30, 2026$/)
    expect(within(card('Schedule')).queryByText('Time elapsed')).not.toBeInTheDocument()
  })

  it('handles a closed, over-budget project without deliverables', () => {
    renderWithProviders(<ProjectOverview project={{ ...ZEUS, deliverables_total: 0, deliverables_completed: 0 }} />)
    expect(screen.getByText('Health is not tracked for completed projects.')).toBeInTheDocument()
    expect(within(card('Progress')).getByText('No deliverables yet')).toBeInTheDocument()
    expect(within(card('Key deliverables')).getByText(/No key deliverables yet/)).toBeInTheDocument()
    expect(within(card('Schedule')).queryByText('Time elapsed')).not.toBeInTheDocument()
    expect(endDate()).toHaveTextContent(/^Sep 30, 2025$/)

    const budget = card('Budget')
    expect(within(budget).getByRole('progressbar', { name: 'No budget' })).toBeInTheDocument()
    expect(within(budget).getByText('-$500.00')).toBeInTheDocument()
    expect(within(budget).getByRole('alert')).toHaveTextContent('Over budget by $500.00')
  })
})

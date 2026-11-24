import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import { theme } from '../theme'
import { relativeDue } from '../utils/format'
import DueDate, { UrgencyLabel } from './DueDate'

const TODAY = '2026-11-24'

describe('DueDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the formatted date as its own text with the urgency label below it', () => {
    const { container } = renderWithProviders(<DueDate date="2026-11-27" today={TODAY} />)
    expect(screen.getByText('Nov 27, 2026')).toBeInTheDocument()
    expect(screen.getByText('Due in 3 days')).toBeInTheDocument()
    expect(container).toHaveTextContent('Nov 27, 2026 Due in 3 days')
  })

  it('colours the label by tone (the text itself says how urgent it is)', () => {
    renderWithProviders(
      <>
        <DueDate date="2026-11-20" today={TODAY} />
        <DueDate date="2026-11-25" today={TODAY} />
        <DueDate date="2027-03-01" today={TODAY} />
      </>,
    )
    expect(screen.getByText('4 days overdue')).toHaveStyle({ color: theme.palette.error.main, fontWeight: 600 })
    expect(screen.getByText('Due tomorrow')).toHaveStyle({ color: theme.palette.warning.dark, fontWeight: 600 })
    expect(screen.getByText('Due in 3 months')).toHaveStyle({ color: theme.palette.text.secondary })
    expect(screen.getByText('Due in 3 months')).not.toHaveStyle({ fontWeight: 600 })
  })

  it('keeps the date and the urgency phrase each on one line, even in a narrow column', () => {
    renderWithProviders(<DueDate date="2027-01-23" kind="end" today={TODAY} />)
    expect(screen.getByText('Jan 23, 2027')).toHaveStyle({ whiteSpace: 'nowrap' })
    expect(screen.getByText('Ends in 2 months')).toHaveStyle({ whiteSpace: 'nowrap' })
  })

  it('words end dates with "Ends"', () => {
    renderWithProviders(<DueDate date="2026-11-24" kind="end" today={TODAY} />)
    expect(screen.getByText('Nov 24, 2026')).toBeInTheDocument()
    expect(screen.getByText('Ends today')).toBeInTheDocument()
  })

  it('shows only the date for finished work', () => {
    const { container } = renderWithProviders(<DueDate date="2026-11-01" done today={TODAY} />)
    expect(container).toHaveTextContent(/^Nov 1, 2026$/)
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  })

  it('shows a dash and no label without a valid date', () => {
    const { container } = renderWithProviders(<DueDate date={null} today={TODAY} />)
    expect(container).toHaveTextContent(/^—$/)
  })

  it('compares with today in UTC when no today is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-24T12:00:00Z'))
    renderWithProviders(<DueDate date="2026-11-23" />)
    expect(screen.getByText('1 day overdue')).toBeInTheDocument()
  })
})

describe('UrgencyLabel', () => {
  const urgency = (date, options) => relativeDue(date, { today: TODAY, ...options })

  it('shows the label alone, styled like under a DueDate: a caption in its tone', () => {
    renderWithProviders(<UrgencyLabel urgency={urgency('2026-11-20')} />)
    const label = screen.getByText('4 days overdue')
    expect(label.tagName).toBe('SPAN')
    expect(label).toHaveClass('MuiTypography-caption')
    expect(label).toHaveStyle({ color: theme.palette.error.main, fontWeight: 600 })
  })

  it('takes the font of the line around it with variant="inherit", keeping its tone', () => {
    const { container } = renderWithProviders(
      <p>
        Apollo CRM · <UrgencyLabel urgency={urgency('2026-11-30', { kind: 'end' })} variant="inherit" />
      </p>,
    )
    const label = screen.getByText('Ends in 6 days')
    expect(label).toHaveClass('MuiTypography-inherit')
    expect(label).not.toHaveClass('MuiTypography-caption')
    expect(label).toHaveStyle({ color: theme.palette.warning.dark, fontWeight: 600, whiteSpace: 'nowrap' })
    expect(container).toHaveTextContent(/^Apollo CRM · Ends in 6 days$/)
  })

  it('renders nothing without an urgency (finished work or no date)', () => {
    const { container } = renderWithProviders(
      <>
        <UrgencyLabel urgency={urgency('2026-11-20', { done: true })} />
        <UrgencyLabel urgency={urgency(null)} />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

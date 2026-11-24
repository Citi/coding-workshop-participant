import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/apiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import { EmptyState, ErrorState, LoadingState, WAKE_UP_HINT } from './StateViews'

describe('LoadingState', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces its label in a polite status region', () => {
    renderWithProviders(<LoadingState label="Loading projects…" />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent(/^Loading projects…$/)
  })

  it('explains the database wake-up inside the same status region after 3 seconds', () => {
    vi.useFakeTimers()
    renderWithProviders(<LoadingState />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/^Loading…$/)
    act(() => vi.advanceTimersByTime(2999))
    expect(screen.queryByText(WAKE_UP_HINT)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    // A second paragraph below the label, inside the region that is already being announced.
    const hint = screen.getByText(WAKE_UP_HINT)
    expect(status).toContainElement(hint)
    expect(hint.tagName).toBe('P')
    expect(status).toHaveTextContent(/^Loading…Waking up the database/)
    expect(WAKE_UP_HINT).toBe('Waking up the database – the first request after a quiet period can take up to 20 seconds.')
  })

  it('can show another slow hint, or none', () => {
    vi.useFakeTimers()
    const { unmount } = renderWithProviders(<LoadingState slowHint="Still working on it." />)
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByRole('status')).toHaveTextContent('Still working on it.')
    unmount()

    renderWithProviders(<LoadingState slowHint={null} />)
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByRole('status')).toHaveTextContent(/^Loading…$/)
  })
})

describe('ErrorState', () => {
  it('shows the title and the API error message with a Retry button', async () => {
    const onRetry = vi.fn()
    renderWithProviders(<ErrorState error={new ApiError({ status: 500, code: 'X', message: 'Server exploded' })} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Server exploded')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('accepts a plain string and has no Retry button without onRetry', () => {
    renderWithProviders(<ErrorState error="Offline" title="Could not load" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load. Offline')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('shows a plain-text title by default and a heading when asked', () => {
    const { unmount } = renderWithProviders(<EmptyState message="Add the first one." action={<button type="button">Add</button>} />)
    expect(screen.getByText('Nothing here yet').tagName).toBe('P')
    expect(screen.getByText('Add the first one.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    unmount()

    renderWithProviders(<EmptyState title="Project not found" titleComponent="h1" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Project not found' })).toBeInTheDocument()
  })
})

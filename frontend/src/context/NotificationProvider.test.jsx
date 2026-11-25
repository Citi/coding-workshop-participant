import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNotify } from './notificationContext'
import { NotificationProvider } from './NotificationProvider'

const ICONS = { success: 'SuccessOutlinedIcon', error: 'ErrorOutlineIcon', info: 'InfoOutlinedIcon', warning: 'ReportProblemOutlinedIcon' }

function Triggers() {
  const notify = useNotify()
  return Object.keys(ICONS).map((severity) => (
    <button key={severity} type="button" onClick={() => notify[severity](`${severity} message`)}>
      {severity}
    </button>
  ))
}

const renderProvider = () =>
  render(
    <NotificationProvider>
      <Triggers />
    </NotificationProvider>,
  )

describe('NotificationProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(Object.keys(ICONS))('shows a %s toast, announced as a status, that can be closed', async (severity) => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: severity }))
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent(`${severity} message`)
    expect(within(toast).getByTestId(ICONS[severity])).toBeInTheDocument()
    await user.click(within(toast).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('shows one toast at a time: a newer message replaces the current one', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'success' }))
    await user.click(screen.getByRole('button', { name: 'error' }))
    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(1))
    expect(screen.getByRole('status')).toHaveTextContent('error message')
  })

  it('keeps a toast open when the user clicks elsewhere on the page', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'info' }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await user.click(document.body)
    expect(screen.getByRole('status')).toHaveTextContent('info message')
  })

  it('hides success messages after 4 seconds but keeps errors for 8 seconds', () => {
    vi.useFakeTimers()
    renderProvider()
    fireEvent.click(screen.getByRole('button', { name: 'success' }))
    act(() => vi.advanceTimersByTime(3900))
    expect(screen.getByRole('status')).toHaveTextContent('success message')
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'error' }))
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).toHaveTextContent('error message')
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('useNotify explains the mistake when used outside <NotificationProvider>', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useNotify())).toThrow('useNotify must be used inside <NotificationProvider>')
  })
})

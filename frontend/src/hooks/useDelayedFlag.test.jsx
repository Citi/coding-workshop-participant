import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDelayedFlag } from './useDelayedFlag'

const renderFlag = (active, delayMs) =>
  renderHook((props) => useDelayedFlag(props.active, props.delayMs), { initialProps: { active, delayMs } })

describe('useDelayedFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('turns true once the value has stayed active for 3 seconds by default', () => {
    const { result } = renderFlag(true)
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(2999))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('accepts a custom delay', () => {
    const { result } = renderFlag(true, 500)
    act(() => vi.advanceTimersByTime(499))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('stays false (and sets no timer) while inactive', () => {
    const { result } = renderFlag(false)
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(10000))
    expect(result.current).toBe(false)
  })

  it('resets as soon as the value turns inactive and starts counting again when it is reactivated', () => {
    const { result, rerender } = renderFlag(true)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current).toBe(true)

    rerender({ active: false })
    expect(result.current).toBe(false)

    rerender({ active: true })
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(2999))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('does not fire when the value turns inactive before the delay', () => {
    const { result, rerender } = renderFlag(true)
    act(() => vi.advanceTimersByTime(2000))
    rerender({ active: false })
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(false)
  })

  it('clears its timer on unmount', () => {
    const { unmount } = renderFlag(true)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

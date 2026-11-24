import { useEffect, useState } from 'react'

/**
 * True once `active` has stayed true for `delayMs` ms; false again as soon as `active` turns false.
 * Used for "this is taking a while" hints that only slow requests should show:
 *
 *   const slow = useDelayedFlag(submitting)   // true after 3 s of submitting
 */
export function useDelayedFlag(active, delayMs = 3000) {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (!active) return undefined
    const timer = setTimeout(() => setElapsed(true), delayMs)
    return () => {
      clearTimeout(timer)
      setElapsed(false)
    }
  }, [active, delayMs])

  // `active &&` hides the flag in the same render that `active` turns false (the reset above runs
  // in the effect cleanup, one commit later).
  return Boolean(active) && elapsed
}

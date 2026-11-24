/**
 * Debounce hook for search inputs.
 */
import { useEffect, useState } from 'react';

/**
 * Return `value` once it has stopped changing for `delay` milliseconds, so a search box
 * does not send one request per keystroke.
 * @template T
 * @param {T} value - Value that changes quickly (e.g. search text).
 * @param {number} [delay=300] - Quiet period in milliseconds.
 * @returns {T} The settled value.
 */
export function useDebouncedValue(value, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export default useDebouncedValue;

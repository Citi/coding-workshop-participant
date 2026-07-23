import { useEffect, useState } from 'react';

/**
 * Delays a rapidly-changing value.
 *
 * Used by the search boxes: without it, every keystroke fires a request and
 * the responses can arrive out of order, so the list flickers back to a
 * previous query's results.
 *
 * @param {any} value
 * @param {number} [delay=300] milliseconds of quiet before the value settles
 */
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // Clearing on every change is what makes this a debounce rather than a
    // throttle: the timer only fires once typing pauses.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Hook that re-runs a data loader when an outside signal changes.
 */
import { useEffect, useRef } from 'react';

/**
 * Call `reload` each time `value` changes after the first render (compared with `Object.is`).
 * For a component whose data comes from `useApi` but also goes stale on an event its loader
 * does not read, such as "the project was saved": the loader keeps its own deps, and the
 * previous data stays on screen while the new request runs.
 * @example
 * const { data, reload } = useApi((signal) => getProjectRisk(projectId, {}, { signal }), [projectId]);
 * useReloadOnChange(revision, reload);
 * @param {unknown} value - Value to watch, e.g. a counter the page bumps after each save.
 * @param {() => void} reload - Function to call when it changes, e.g. useApi's `reload`.
 * @returns {void}
 */
export function useReloadOnChange(value, reload) {
  const seen = useRef(value);
  useEffect(() => {
    if (Object.is(seen.current, value)) {
      return;
    }
    seen.current = value;
    reload();
  }, [value, reload]);
}

export default useReloadOnChange;

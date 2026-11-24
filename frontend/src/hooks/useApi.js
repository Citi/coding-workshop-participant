/**
 * Data-loading hook for API calls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../services/apiClient.js';

/**
 * Turn a dependency list into a comparable key. Values are compared by content, so a
 * params object rebuilt on every render does not trigger a new request.
 * @param {unknown[]} deps - Dependency values.
 * @returns {string} Key that changes when any value changes.
 */
function dependencyKey(deps) {
  try {
    return JSON.stringify(deps);
  } catch {
    return deps.map((value) => String(value)).join('\u0000');
  }
}

/**
 * Run an async loader and track its data, error and loading state. Works like
 * `useEffect`: the loader runs on mount and again whenever a value in `deps` changes
 * (ESLint's exhaustive-deps rule checks the list, as it does for useEffect).
 *
 * The loader receives an AbortSignal; a newer run or unmounting cancels the older one,
 * so a slow response never overwrites a newer one. While reloading, the previous data
 * stays available so tables do not flash empty.
 *
 * @example
 * const { data, error, loading, reload } = useApi(
 *   (signal) => listProjects({ q, status }, { signal }),
 *   [q, status],
 * );
 *
 * @param {(signal: AbortSignal) => Promise<any>} loader - Fetches the data; may be an inline function.
 * @param {unknown[]} [deps] - Values the loader uses; a change triggers a new request.
 * @param {{enabled?: boolean}} [options] - `enabled: false` skips loading (e.g. no id yet).
 * @returns {{data: any, error: Error|null, loading: boolean, reload: () => void,
 *   setData: (value: any) => void}} Request state; `setData` applies optimistic local updates.
 */
export function useApi(loader, deps = [], { enabled = true } = {}) {
  const loaderRef = useRef(loader);
  const key = dependencyKey(deps);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState({ key: null, reloadCount: -1, data: undefined, error: null });

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => loaderRef.current(controller.signal))
      .then(
        (data) => {
          if (active) {
            setResult({ key, reloadCount, data, error: null });
          }
        },
        (error) => {
          if (active && !isAbortError(error)) {
            setResult((previous) => ({ key, reloadCount, data: previous.data, error }));
          }
        },
      );
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, reloadCount, enabled]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const setData = useCallback((value) => {
    setResult((previous) => ({
      ...previous,
      data: typeof value === 'function' ? value(previous.data) : value,
    }));
  }, []);

  const loading = enabled && (result.key !== key || result.reloadCount !== reloadCount);
  return { data: result.data, error: loading ? null : result.error, loading, reload, setData };
}

export default useApi;

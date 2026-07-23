import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wraps an async call in the loading/error/data states every screen needs, so
 * no component hand-rolls the same four useStates and a try/catch.
 *
 * Two shapes:
 *   useApi(fn)                                   -- manual: call run() yourself
 *   useApi(fn, { immediate: true, deps: [...] }) -- fetch on mount and on deps
 *
 * @param {Function} apiCall             returns a promise
 * @param {object}   [options]
 * @param {boolean}  [options.immediate=false]
 * @param {any[]}    [options.deps=[]]
 * @param {any}      [options.initialData=null]
 * @param {Function} [options.onSuccess]
 * @param {Function} [options.onError]
 */
export default function useApi(apiCall, options = {}) {
  const { immediate = false, deps = [], initialData = null, onSuccess, onError } = options;

  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);

  // Guards against setting state after unmount, and against a slow earlier
  // request overwriting a faster later one (the classic out-of-order fetch).
  const mounted = useRef(true);
  const callId = useRef(0);

  // Held in refs so changing callbacks never re-trigger an immediate fetch.
  const apiCallRef = useRef(apiCall);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    apiCallRef.current = apiCall;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Executes the call. Resolves with the payload, or rejects so callers that
   * need to branch on failure (a form deciding whether to close) still can.
   */
  const run = useCallback(async (...args) => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);

    try {
      const result = await apiCallRef.current(...args);
      if (mounted.current && id === callId.current) {
        setData(result);
        setLoading(false);
        onSuccessRef.current?.(result);
      }
      return result;
    } catch (caught) {
      if (mounted.current && id === callId.current) {
        setError(caught);
        setLoading(false);
        onErrorRef.current?.(caught);
      }
      throw caught;
    }
  }, []);

  /** Re-runs the call -- wired to "Retry" in error states. */
  const refresh = useCallback(() => run(), [run]);

  const reset = useCallback(() => {
    callId.current += 1;
    setData(initialData);
    setError(null);
    setLoading(false);
    // initialData is intentionally excluded: callers routinely pass an inline
    // [] or {}, which would change identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!immediate) return;
    // Rejections are already captured into `error` state by `run`.
    //
    // set-state-in-effect is disabled deliberately: fetching on mount is the
    // whole point of `immediate`, and the synchronous setLoading(true) is what
    // paints the spinner on the first frame. Deferring it would show an empty
    // state before the loading state, which is worse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run().catch(() => {});
  }, [immediate, run, ...deps]);

  return { data, error, loading, run, refresh, reset, setData };
}

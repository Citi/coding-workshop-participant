import {
  useCallback, useEffect, useRef, useState,
} from 'react';

/**
 * Load data from an async function with loading / error state and a reload().
 *
 * The request re-runs whenever a value in `deps` changes or `reload()` is called.
 * Loading is derived (the last settled request does not match the current
 * inputs), so no state is set synchronously inside the effect.
 *
 * @param {() => Promise<any>} loader Async function returning data.
 * @param {Array} deps Values the loader depends on.
 * @returns {{data: any, loading: boolean, error: Error|null, reload: Function, setData: Function}}
 */
export default function useApi(loader, deps = []) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });
  const loaderRef = useRef(loader);
  const key = JSON.stringify([...deps, version]);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let active = true;
    loaderRef.current()
      .then((data) => active && setState({ key, data, error: null }))
      .catch((error) => active && setState((s) => ({ key, data: s.data, error })));
    return () => {
      active = false;
    };
  }, [key]);

  const loading = state.key !== key;
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((data) => setState((s) => ({ ...s, data })), []);

  return {
    data: state.data, loading, error: loading ? null : state.error, reload, setData,
  };
}

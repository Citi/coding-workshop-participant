/**
 * Data-loading hook for API calls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../services/apiClient.js';

// Marker keys start with a NUL character so they cannot collide with real data.
const IDENTITY_MARKER = '\u0000ref';
const BIGINT_MARKER = '\u0000bigint';
const NUMBER_MARKER = '\u0000number';

const objectIds = new WeakMap();
const symbolIds = new Map();
let lastIdentityId = 0;

/**
 * Stable token for one object, function or symbol: the same value always gets the same
 * token, and two different values never share one (like `Object.is`).
 * @param {object|Function|symbol} value - Value compared by identity.
 * @returns {Record<string, number>} JSON-encodable token.
 */
function identityToken(value) {
  const registry = typeof value === 'symbol' ? symbolIds : objectIds;
  let id = registry.get(value);
  if (id === undefined) {
    lastIdentityId += 1;
    id = lastIdentityId;
    registry.set(value, id);
  }
  return { [IDENTITY_MARKER]: id };
}

/**
 * Whether a value is plain data that can be compared by content.
 * @param {object} value - A non-null object.
 * @returns {boolean} True for arrays and plain objects.
 */
function isPlainData(value) {
  if (Array.isArray(value)) {
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * JSON.stringify replacer: functions, symbols, Maps, Sets and class instances become identity
 * tokens; BigInt and non-finite numbers get explicit markers. Dates arrive here already
 * converted by their toJSON, so they compare by content.
 * @param {string} _key - Property name (unused).
 * @param {unknown} value - Value being encoded.
 * @returns {unknown} Value to encode in its place.
 */
function encodeDependency(_key, value) {
  if (typeof value === 'function' || typeof value === 'symbol') {
    return identityToken(value);
  }
  if (typeof value === 'bigint') {
    return { [BIGINT_MARKER]: value.toString() };
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { [NUMBER_MARKER]: String(value) };
  }
  if (value !== null && typeof value === 'object' && !isPlainData(value)) {
    return identityToken(value);
  }
  return value;
}

/**
 * Turn a dependency list into a comparable key. Plain data (primitives, arrays, plain
 * objects, Dates) is compared by content, so a params object rebuilt on every render does
 * not trigger a new request. Functions, Maps, Sets, class instances such as URLSearchParams,
 * and circular objects are compared by identity, as useEffect compares them, so a memoised
 * loader listed as a dependency triggers a new request when it changes.
 * @param {unknown[]} deps - Dependency values.
 * @returns {string} Key that changes when any value changes.
 */
export function dependencyKey(deps) {
  const values = Array.isArray(deps) ? deps : [deps];
  return values
    .map((value) => {
      if (value === undefined) {
        return 'undefined';
      }
      try {
        return JSON.stringify(value, encodeDependency);
      } catch {
        // Circular data (or a throwing getter) cannot be encoded: compare it by identity.
        return typeof value === 'object' && value !== null
          ? JSON.stringify(identityToken(value))
          : String(value);
      }
    })
    .join(',');
}

/**
 * Run an async loader and track its data, error and loading state. Works like
 * `useEffect`: the loader runs on mount and again whenever a value in `deps` changes
 * (ESLint's exhaustive-deps rule checks the list, as it does for useEffect). Functions and
 * class instances in `deps` are compared by identity, like useEffect; plain data is
 * compared by content (see `dependencyKey`).
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
 * // A memoised loader works too: it re-runs whenever useCallback returns a new function.
 * const load = useCallback((signal) => listProjects({ status }, { signal }), [status]);
 * const projects = useApi(load, [load]);
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

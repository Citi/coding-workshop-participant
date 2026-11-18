import { useCallback, useState } from 'react';

/**
 * Run an async API action with shared busy/error state.
 * `run(fn)` resolves to fn's result on success, or `undefined` on failure
 * (the error message is stored in `error`).
 */
export default function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      return result ?? true;
    } catch (err) {
      setError(err.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy, error, setError };
}

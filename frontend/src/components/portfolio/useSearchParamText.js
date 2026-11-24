/**
 * Search-box text that stays linkable through the query string without dropping keystrokes.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keep a search box's text in local state and copy it into one query-string parameter once
 * typing pauses, so a search can still be bookmarked or shared.
 *
 * Why not bind the box to the URL directly: React Router applies every URL change inside a
 * transition (a low-priority update), and React resets a controlled input to its last
 * committed value after each keystroke, so the next key lands on stale text and characters
 * are lost at normal typing speed. Here the text updates at once; only the settled text goes
 * to the URL, replacing the history entry. A change to the parameter made elsewhere (a link
 * or Back/Forward) is copied back into the box, while this hook's own writes are recognised
 * and never overwrite what the user typed in the meantime.
 *
 * @example
 * const { text, setText, settledText } = useSearchParamText('q');
 * <FilterBar searchValue={text} onSearchChange={setText} ... />
 * useApi((signal) => listThings({ q: settledText.trim() || undefined }, { signal }), [settledText]);
 *
 * @param {string} [key='q'] - Query-string parameter that holds the text.
 * @param {number} [delay=300] - Quiet period in milliseconds before the text settles.
 * @returns {{text: string, setText: (value: string) => void, settledText: string}} The text to
 *   show in the box, its setter, and the settled text (send this one to the API).
 */
export default function useSearchParamText(key = 'q', delay = 300) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlText = searchParams.get(key) ?? '';
  // seen: the URL value last reconciled; pending: values written to the URL, not yet seen there.
  const [state, setState] = useState(() => ({ text: urlText, settled: urlText, seen: urlText, pending: [] }));

  // Reconcile during render when the URL value changes (React's pattern for state that
  // follows a changing input): one of our own writes arriving only updates the bookkeeping;
  // anything else replaces the text.
  let current = state;
  if (urlText !== state.seen) {
    const index = state.pending.indexOf(urlText);
    current =
      index >= 0
        ? { ...state, seen: urlText, pending: state.pending.slice(index + 1) }
        : { text: urlText, settled: urlText, seen: urlText, pending: [] };
    setState(current);
  }

  const { text, settled } = current;
  useEffect(() => {
    if (text === settled) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setState((previous) => {
        if (previous.text !== text) {
          return previous;
        }
        const pending = text === previous.seen ? previous.pending : [...previous.pending, text];
        return { ...previous, settled: text, pending };
      });
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (text) {
            next.set(key, text);
          } else {
            next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [text, settled, key, delay, setSearchParams]);

  const setText = useCallback((value) => {
    const next = String(value ?? '');
    setState((previous) => (previous.text === next ? previous : { ...previous, text: next }));
  }, []);

  return { text, setText, settledText: settled };
}

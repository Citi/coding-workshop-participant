import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { NotificationContext } from './notificationContext.js';
import useIsMobile from '../hooks/useIsMobile.js';

const AUTO_HIDE_MS = { success: 4000, info: 5000, warning: 7000, error: 8000 };

/** Default shortest time a message stays on screen before a queued message replaces it. */
export const MIN_VISIBLE_MS = 1500;

const IDLE = { current: null, queue: [], open: false };

function messageFrom(errorOrMessage, fallback) {
  if (typeof errorOrMessage === 'string' && errorOrMessage) {
    return errorOrMessage;
  }
  if (errorOrMessage && typeof errorOrMessage.message === 'string' && errorOrMessage.message) {
    return errorOrMessage.message;
  }
  return fallback;
}

/**
 * App-wide snackbar for success and failure feedback (spec 12.4). Messages queue and show
 * one at a time. A queued message closes the current one early, but only after the current
 * one has been visible for `minVisibleMs`, so two messages sent together are both readable
 * (for example "Allocation saved." followed by its capacity warning).
 *
 * A message becomes current only together with `open: true`, and it is closed only after it
 * has rendered open (auto-hide, the close button, or the early-close timer). That guarantees
 * the exit transition runs and `onExited` advances the queue: MUI's Snackbar renders nothing,
 * and never fires `onExited`, for a message that mounts closed.
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - The app.
 * @param {number} [props.minVisibleMs] - Shortest display time before a queued message
 *   replaces the current one. Defaults to MIN_VISIBLE_MS; the test helpers pass 0.
 * @returns {JSX.Element} Provider plus the snackbar.
 */
export default function NotificationProvider({ children, minVisibleMs = MIN_VISIBLE_MS }) {
  const isMobile = useIsMobile();
  const nextId = useRef(0);
  const [state, setState] = useState(IDLE);

  const notify = useCallback((message, severity = 'info') => {
    nextId.current += 1;
    const item = { id: nextId.current, message: String(message ?? ''), severity };
    const now = Date.now();
    setState((previous) =>
      previous.current
        ? { ...previous, queue: [...previous.queue, item] }
        : { current: { ...item, shownAt: now }, queue: [], open: true },
    );
  }, []);

  const value = useMemo(
    () => ({
      notify,
      success: (message) => notify(message, 'success'),
      info: (message) => notify(message, 'info'),
      warning: (message) => notify(message, 'warning'),
      error: (errorOrMessage, fallback = 'Something went wrong. Please try again.') =>
        notify(messageFrom(errorOrMessage, fallback), 'error'),
    }),
    [notify],
  );

  const { current, queue, open } = state;
  const currentId = current?.id;
  const shownAt = current?.shownAt;
  const hasQueued = queue.length > 0;

  // Close the current message early once something is waiting and it has been readable.
  useEffect(() => {
    if (!open || !hasQueued || currentId === undefined) {
      return undefined;
    }
    const remaining = Math.max(0, minVisibleMs - (Date.now() - shownAt));
    const timer = window.setTimeout(() => {
      setState((previous) =>
        previous.current?.id === currentId && previous.open ? { ...previous, open: false } : previous,
      );
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [open, hasQueued, currentId, shownAt, minVisibleMs]);

  const handleClose = useCallback((_, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setState((previous) => (previous.open ? { ...previous, open: false } : previous));
  }, []);

  // After the exit transition: show the next queued message, or go idle.
  const handleExited = useCallback((exitedId) => {
    const now = Date.now();
    setState((previous) => {
      if (previous.current?.id !== exitedId) {
        return previous;
      }
      const [next, ...rest] = previous.queue;
      return next ? { current: { ...next, shownAt: now }, queue: rest, open: true } : IDLE;
    });
  }, []);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Snackbar
        key={currentId ?? 'idle'}
        open={open}
        autoHideDuration={AUTO_HIDE_MS[current?.severity] ?? 5000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: isMobile ? 'center' : 'left' }}
        slotProps={{ transition: { onExited: () => handleExited(currentId) } }}
      >
        {current ? (
          <Alert severity={current.severity} variant="filled" onClose={handleClose} sx={{ width: '100%' }}>
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  );
}

NotificationProvider.propTypes = {
  children: PropTypes.node,
  minVisibleMs: PropTypes.number,
};

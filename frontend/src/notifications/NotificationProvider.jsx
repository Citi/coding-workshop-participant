import { useCallback, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { NotificationContext } from './notificationContext.js';
import useIsMobile from '../hooks/useIsMobile.js';

const AUTO_HIDE_MS = { success: 4000, info: 5000, warning: 7000, error: 8000 };

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
 * one at a time; a new message closes the current one early.
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - The app.
 * @returns {JSX.Element} Provider plus the snackbar.
 */
export default function NotificationProvider({ children }) {
  const isMobile = useIsMobile();
  const nextId = useRef(0);
  const [state, setState] = useState({ current: null, queue: [], open: false });

  const notify = useCallback((message, severity = 'info') => {
    nextId.current += 1;
    const item = { id: nextId.current, message: String(message ?? ''), severity };
    setState((previous) => {
      if (!previous.current) {
        return { current: item, queue: [], open: true };
      }
      return { ...previous, queue: [...previous.queue, item], open: false };
    });
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

  const handleClose = (_, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setState((previous) => ({ ...previous, open: false }));
  };

  const handleExited = () => {
    setState((previous) =>
      previous.queue.length > 0
        ? { current: previous.queue[0], queue: previous.queue.slice(1), open: true }
        : { current: null, queue: [], open: false },
    );
  };

  const { current } = state;
  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.id ?? 'idle'}
        open={state.open}
        autoHideDuration={AUTO_HIDE_MS[current?.severity] ?? 5000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: isMobile ? 'center' : 'left' }}
        slotProps={{ transition: { onExited: handleExited } }}
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
};

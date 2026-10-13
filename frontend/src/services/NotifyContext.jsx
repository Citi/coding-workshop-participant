import {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import { Alert, Snackbar } from '@mui/material';

const NotifyContext = createContext(() => {});

/**
 * App-wide toast notifications for success / error feedback.
 * @param {{children: React.ReactNode}} props
 */
export function NotifyProvider({ children }) {
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, severity = 'success') => {
    setToast({ message, severity, key: Date.now() });
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Snackbar
        key={toast?.key}
        open={Boolean(toast)}
        autoHideDuration={toast?.severity === 'error' ? 6000 : 3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotifyContext.Provider>
  );
}

NotifyProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Returns `notify(message, severity)`.
 * @returns {(message: string, severity?: 'success'|'error'|'info'|'warning') => void}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useNotify() {
  return useContext(NotifyContext);
}

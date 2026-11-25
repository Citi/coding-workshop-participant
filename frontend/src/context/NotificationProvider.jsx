import { useCallback, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import { NotificationContext } from './notificationContext'

/** Shows one toast at a time at the bottom of the screen (announced to screen readers). */
export function NotificationProvider({ children }) {
  const [toast, setToast] = useState(null)

  const show = useCallback((severity, message) => setToast({ severity, message, key: Date.now() }), [])
  const close = useCallback((_event, reason) => {
    if (reason !== 'clickaway') setToast(null)
  }, [])

  const value = useMemo(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
      warning: (message) => show('warning', message),
    }),
    [show],
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Snackbar
        key={toast?.key}
        open={Boolean(toast)}
        autoHideDuration={toast?.severity === 'error' ? 8000 : 4000}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert onClose={close} severity={toast.severity} variant="filled" sx={{ width: '100%' }} role="status">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  )
}

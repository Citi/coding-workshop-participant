/**
 * Hook for showing success and failure messages in the app-wide snackbar.
 */
import { useContext } from 'react';
import { NotificationContext } from './notificationContext.js';

/**
 * Access the notification functions.
 * @example
 * const notify = useNotify();
 * notify.success('Project saved.');
 * notify.error(apiError); // shows the ApiError's message
 * @returns {{notify: (message: string, severity?: 'success'|'info'|'warning'|'error') => void,
 *   success: (message: string) => void, info: (message: string) => void,
 *   warning: (message: string) => void, error: (errorOrMessage: Error|string, fallback?: string) => void}}
 *   Notification functions.
 * @throws {Error} When used outside NotificationProvider.
 */
export function useNotify() {
  const value = useContext(NotificationContext);
  if (!value) {
    throw new Error('useNotify must be used inside <NotificationProvider>.');
  }
  return value;
}

export default useNotify;

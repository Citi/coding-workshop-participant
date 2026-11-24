/**
 * React context for snackbar notifications; provided by NotificationProvider.
 */
import { createContext } from 'react';

/** Holds `{ notify, success, info, warning, error }`; null outside the provider. */
export const NotificationContext = createContext(null);

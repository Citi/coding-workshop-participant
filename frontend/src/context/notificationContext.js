// Toast notifications for success/failure feedback. Use: const notify = useNotify(); notify.success('Saved')
import { createContext, useContext } from 'react'

export const NotificationContext = createContext(null)

export function useNotify() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotify must be used inside <NotificationProvider>')
  return context
}

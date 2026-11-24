import Alert from '@mui/material/Alert'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/authContext'
import PageHeader from './PageHeader'

/** Sends anonymous visitors to /login (and back to the page they wanted after logging in). */
export function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

/** Shows an "access denied" page (with its own h1 and tab title) instead of a page the role may not open. */
export function RequirePermission({ permission, children }) {
  const { can } = useAuth()
  if (!can(permission)) {
    return (
      <>
        <PageHeader title="Access denied" />
        <Alert severity="warning">Your role does not allow you to view this page.</Alert>
      </>
    )
  }
  return children
}

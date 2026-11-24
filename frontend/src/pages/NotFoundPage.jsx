import Button from '@mui/material/Button'
import { Link as RouterLink } from 'react-router-dom'
import { EmptyState } from '../components/StateViews'

export default function NotFoundPage() {
  return (
    <EmptyState
      titleComponent="h1"
      title="Page not found"
      message="The page you are looking for does not exist or was moved."
      action={
        <Button component={RouterLink} to="/" variant="contained">
          Go to dashboard
        </Button>
      }
    />
  )
}

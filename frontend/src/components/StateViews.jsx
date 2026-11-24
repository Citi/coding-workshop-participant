import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

/** Centered spinner with a text label (announced to screen readers). */
export function LoadingState({ label = 'Loading…' }) {
  return (
    <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, py: 6 }}>
      <CircularProgress size={28} />
      <Typography color="textSecondary">{label}</Typography>
    </Box>
  )
}

/** Error message from an ApiError (or string) with an optional Retry button. */
export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  const message = typeof error === 'string' ? error : error?.message || 'Please try again.'
  return (
    <Alert
      severity="error"
      sx={{ my: 2 }}
      action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : undefined}
    >
      <strong>{title}.</strong> {message}
    </Alert>
  )
}

/**
 * Friendly placeholder when a list has no rows. The title is plain text by default (an empty list
 * is not a document section, so it must not break the page's h1 > h2 outline); a page that is
 * nothing but this message (e.g. "Project not found") passes titleComponent="h1".
 */
export function EmptyState({ title = 'Nothing here yet', message, action, titleComponent = 'p' }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
      <Typography variant="h6" component={titleComponent} gutterBottom>{title}</Typography>
      {message && <Typography color="textSecondary" sx={{ mb: action ? 2 : 0 }}>{message}</Typography>}
      {action}
    </Box>
  )
}

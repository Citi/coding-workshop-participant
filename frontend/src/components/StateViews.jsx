import PropTypes from 'prop-types';
import {
  Alert, Box, Button, CircularProgress, Typography,
} from '@mui/material';

/** Centered spinner with an accessible label. */
export function Loading({ label = 'Loading' }) {
  return (
    <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 6, justifyContent: 'center' }}>
      <CircularProgress size={22} />
      <Typography color="text.secondary">{label}…</Typography>
    </Box>
  );
}

Loading.propTypes = { label: PropTypes.string };

/** Error banner with a retry action. */
export function ErrorState({ error, onRetry }) {
  return (
    <Alert
      severity="error"
      sx={{ my: 2 }}
      action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Try again</Button> : undefined}
    >
      {error?.message || 'Something went wrong.'}
    </Alert>
  );
}

ErrorState.propTypes = {
  error: PropTypes.shape({ message: PropTypes.string }),
  onRetry: PropTypes.func,
};

/** Empty-list message that points to the next action. */
export function EmptyState({ title, children, action }) {
  return (
    <Box sx={{ py: 5, px: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="h4" component="p" gutterBottom>{title}</Typography>
      {children && <Typography color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>{children}</Typography>}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  action: PropTypes.node,
};

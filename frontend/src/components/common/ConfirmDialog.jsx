import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

/**
 * Confirmation prompt for destructive actions.
 *
 * Holds no state of its own -- the parent owns "what am I deleting" and passes
 * `open`. That keeps one source of truth for the pending record and stops the
 * dialog going stale when the row underneath changes.
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmColor = 'error',
  loading = false,
  error,
}) {
  return (
    <Dialog
      open={open}
      // Ignoring backdrop clicks mid-request stops the user dismissing a
      // delete they cannot tell has already been sent.
      onClose={loading ? undefined : onCancel}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>

      <DialogContent>
        <DialogContentText id="confirm-dialog-description" component="div">
          {message}
        </DialogContentText>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error.message}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          color={confirmColor}
          variant="contained"
          disabled={loading}
          // Focus lands here on open; the action is deliberate, and Escape
          // still cancels for anyone who opened it by mistake.
          autoFocus
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

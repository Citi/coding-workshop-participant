import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

/**
 * Confirmation for destructive actions. onConfirm() -> Promise; on success the caller closes
 * the dialog, on failure the error message is shown and the user can retry or cancel.
 */
export default function ConfirmDialog({ open, onClose, ...props }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      {open && <ConfirmDialogBody onClose={onClose} {...props} />}
    </Dialog>
  )
}

function ConfirmDialogBody({ title = 'Are you sure?', message, confirmLabel = 'Delete', confirmColor = 'error', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(err?.message || 'The action failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}
        {/* The dialog's description: screen readers announce the consequences when it opens. */}
        <DialogContentText id="confirm-dialog-message">{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={confirm}
          color={confirmColor}
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </>
  )
}

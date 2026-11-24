import { useId } from 'react';
import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

/**
 * Confirmation step shown before every delete (spec 12.4). Focus starts on Cancel so
 * pressing Enter never deletes by accident.
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the dialog is shown.
 * @param {string} [props.title] - Question, e.g. "Delete project?".
 * @param {import('react').ReactNode} [props.message] - What will happen.
 * @param {string} [props.confirmLabel] - Confirm button text.
 * @param {string} [props.cancelLabel] - Cancel button text.
 * @param {boolean} [props.destructive] - Use the error colour for the confirm button.
 * @param {boolean} [props.loading] - Disable both buttons while the action runs.
 * @param {() => void} props.onConfirm - Called when confirmed.
 * @param {() => void} props.onCancel - Called when cancelled or dismissed.
 * @returns {JSX.Element} The dialog.
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      aria-labelledby={titleId}
      aria-describedby={message ? descriptionId : undefined}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      {message ? (
        <DialogContent>
          <DialogContentText id={descriptionId} component="div">
            {message}
          </DialogContentText>
        </DialogContent>
      ) : null}
      <DialogActions>
        <Button onClick={onCancel} disabled={loading} autoFocus>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          color={destructive ? 'error' : 'primary'}
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" aria-hidden="true" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string,
  message: PropTypes.node,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  destructive: PropTypes.bool,
  loading: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

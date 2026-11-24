import { useId } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import useIsMobile from '../../hooks/useIsMobile.js';

/**
 * Dialog that wraps a create/edit form: the whole paper is the `<form>`, so Enter submits,
 * the summary error sits above the fields, both buttons are disabled while saving and the
 * dialog cannot be dismissed mid-save. Full screen on phones.
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the dialog is shown.
 * @param {string} props.title - Dialog heading.
 * @param {import('react').ReactNode} [props.description] - One line under the heading.
 * @param {(event: object) => void} props.onSubmit - Form submit handler.
 * @param {() => void} props.onClose - Called on Cancel, Escape or a backdrop click.
 * @param {boolean} [props.submitting] - Disable everything while the request runs.
 * @param {string} [props.submitLabel] - Submit button text.
 * @param {string} [props.formError] - Summary error from the server.
 * @param {'xs'|'sm'|'md'} [props.maxWidth] - Dialog width on larger screens.
 * @param {import('react').ReactNode} props.children - The fields.
 * @returns {JSX.Element} The dialog.
 */
export default function FormDialog({
  open,
  title,
  description,
  onSubmit,
  onClose,
  submitting = false,
  submitLabel = 'Save',
  formError = '',
  maxWidth = 'sm',
  children,
}) {
  const isMobile = useIsMobile();
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth={maxWidth}
      aria-labelledby={titleId}
      slotProps={{ paper: { component: 'form', noValidate: true, onSubmit } }}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent dividers>
        {description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {description}
          </Typography>
        ) : null}
        {formError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        ) : null}
        {children}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" aria-hidden="true" /> : undefined}
        >
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

FormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.node,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  submitting: PropTypes.bool,
  submitLabel: PropTypes.string,
  formError: PropTypes.string,
  maxWidth: PropTypes.oneOf(['xs', 'sm', 'md']),
  children: PropTypes.node.isRequired,
};

import { useId } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useIsMobile from '../../hooks/useIsMobile.js';

/**
 * Dialog that is also a form: title, an optional summary error, the fields, and Cancel and
 * submit buttons. Pressing Enter in a field submits. Full screen on mobile. While
 * `submitting`, both buttons are disabled and the dialog cannot be dismissed.
 * @param {object} props - Component props.
 * @param {boolean} [props.open] - Whether the dialog is shown.
 * @param {string} props.title - Dialog heading (also its accessible name).
 * @param {import('react').ReactNode} [props.description] - Line under the title.
 * @param {string} props.submitLabel - Submit button text, e.g. "Save".
 * @param {string} [props.submittingLabel] - Submit text while saving.
 * @param {boolean} [props.submitting] - A save is in flight.
 * @param {string} [props.formError] - Summary error shown above the fields.
 * @param {() => void} props.onSubmit - Called on submit (the default action is prevented).
 * @param {() => void} props.onClose - Called on Cancel, Escape or a backdrop click.
 * @param {import('react').ReactNode} props.children - The fields.
 * @param {'xs'|'sm'|'md'} [props.maxWidth] - Dialog width on desktop.
 * @returns {JSX.Element} The dialog.
 */
export default function FormDialog({
  open = true,
  title,
  description,
  submitLabel,
  submittingLabel = 'Saving…',
  submitting = false,
  formError,
  onSubmit,
  onClose,
  children,
  maxWidth = 'sm',
}) {
  const isMobile = useIsMobile();
  const titleId = useId();

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!submitting) {
      onSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth={maxWidth}
      fullScreen={isMobile}
      slotProps={{ paper: { component: 'form', noValidate: true, onSubmit: handleSubmit } }}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1}>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {description}
            </Typography>
          ) : null}
          {formError ? (
            <Alert severity="error" sx={{ mb: 1 }}>
              {formError}
            </Alert>
          ) : null}
          {children}
        </Stack>
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
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

FormDialog.propTypes = {
  open: PropTypes.bool,
  title: PropTypes.string.isRequired,
  description: PropTypes.node,
  submitLabel: PropTypes.string.isRequired,
  submittingLabel: PropTypes.string,
  submitting: PropTypes.bool,
  formError: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  maxWidth: PropTypes.oneOf(['xs', 'sm', 'md']),
};

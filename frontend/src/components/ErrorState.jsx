import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';

const TITLES = {
  403: 'Access denied',
  404: 'Not found',
};

/**
 * Error message with an optional retry button. Accepts an ApiError, an Error or a string.
 * @param {object} props - Component props.
 * @param {Error|string} [props.error] - What went wrong.
 * @param {string} [props.title] - Heading; derived from the error status when omitted.
 * @param {() => void} [props.onRetry] - Shows a Retry button when given.
 * @param {import('react').ReactNode} [props.action] - Extra action next to Retry.
 * @returns {JSX.Element} The error alert.
 */
export default function ErrorState({ error, title, onRetry, action }) {
  const message =
    typeof error === 'string' ? error : error?.message || 'Something went wrong. Please try again.';
  const heading = title ?? TITLES[error?.status] ?? 'Could not load this data';
  return (
    <Alert
      severity="error"
      sx={{ my: 2, alignItems: 'flex-start' }}
      action={
        onRetry || action ? (
          <>
            {action}
            {onRetry ? (
              <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <AlertTitle>{heading}</AlertTitle>
      {message}
    </Alert>
  );
}

ErrorState.propTypes = {
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Error), PropTypes.object]),
  title: PropTypes.string,
  onRetry: PropTypes.func,
  action: PropTypes.node,
};

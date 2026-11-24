import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

/**
 * Centred spinner with a message, announced politely to screen readers.
 * @param {object} props - Component props.
 * @param {string} [props.message] - Text under the spinner.
 * @param {boolean} [props.fullPage] - Fill the viewport (used before the app shell renders).
 * @returns {JSX.Element} The loading indicator.
 */
export default function LoadingState({ message = 'Loading…', fullPage = false }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        py: 6,
        minHeight: fullPage ? '100vh' : undefined,
      }}
    >
      <CircularProgress aria-label={message} />
      <Typography color="text.secondary">{message}</Typography>
    </Box>
  );
}

LoadingState.propTypes = {
  message: PropTypes.string,
  fullPage: PropTypes.bool,
};

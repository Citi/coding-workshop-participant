import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatWindow } from './capacityUtils.js';

/**
 * Warning shown after an allocation save that leaves the person above 100% (spec section 8:
 * the save is never blocked; the API returns `capacity_warning` instead). Lists every
 * conflict window with its load.
 * @param {object} props - Component props.
 * @param {{user_name: string, peak_load: number, message?: string,
 *   windows: Array<{start_date: string, end_date: string, load: number}>}} props.warning - The API's warning.
 * @param {() => void} [props.onClose] - Shows a close button when given.
 * @returns {JSX.Element} The alert.
 */
export default function CapacityWarningAlert({ warning, onClose }) {
  const windows = warning.windows ?? [];
  return (
    <Alert severity="warning" onClose={onClose} sx={{ mb: 2 }} data-testid="capacity-warning">
      <AlertTitle>
        {warning.user_name} is over-allocated: peak {warning.peak_load}%
      </AlertTitle>
      {warning.message ? <Typography variant="body2">{warning.message}</Typography> : null}
      {windows.length > 0 ? (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {windows.map((span) => (
            <Typography component="li" variant="body2" key={`${span.start_date}-${span.end_date}`}>
              {span.load}% from {formatWindow(span.start_date, span.end_date)}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Alert>
  );
}

CapacityWarningAlert.propTypes = {
  warning: PropTypes.shape({
    user_id: PropTypes.number,
    user_name: PropTypes.string.isRequired,
    peak_load: PropTypes.number.isRequired,
    message: PropTypes.string,
    windows: PropTypes.arrayOf(
      PropTypes.shape({
        start_date: PropTypes.string.isRequired,
        end_date: PropTypes.string.isRequired,
        load: PropTypes.number.isRequired,
      }),
    ),
  }).isRequired,
  onClose: PropTypes.func,
};

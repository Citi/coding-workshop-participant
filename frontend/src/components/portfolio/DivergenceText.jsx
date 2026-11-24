import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { DIVERGENCE_RISK_THRESHOLD, divergenceWords, formatPoints } from './budgetUtils.js';

/**
 * Budget-versus-progress divergence in points with a plain-language reading, e.g.
 * "+40.0 pts" over "Spending well ahead of progress". Above the risk engine's 10-point
 * threshold a warning icon is added; the words carry the meaning on their own.
 * @param {object} props - Component props.
 * @param {number|null} props.value - Utilization minus completion, in percentage points.
 * @returns {JSX.Element} The divergence.
 */
export default function DivergenceText({ value }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const flagged = known && value > DIVERGENCE_RISK_THRESHOLD;
  return (
    <Box
      component="span"
      sx={{ display: 'block' }}
      title={flagged ? `More than ${DIVERGENCE_RISK_THRESHOLD} points: counts toward the risk score` : undefined}
    >
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
        {flagged ? <WarningAmberIcon fontSize="inherit" color="warning" aria-hidden="true" /> : null}
        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatPoints(value)}
        </Box>
      </Box>
      <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
        {divergenceWords(value)}
      </Typography>
    </Box>
  );
}

DivergenceText.propTypes = {
  value: PropTypes.number,
};

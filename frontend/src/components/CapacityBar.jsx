import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';
import { tokens } from '../theme';
import { formatHours } from '../utils/format';

/**
 * The tracker's signature "time card" strip: hours logged against planned
 * capacity (8 h per weekday per person). Tick marks every 10% read like the
 * perforations on a punch card; going over plan turns the overflow brick red.
 * @param {{logged: number, planned: number, compact?: boolean, label?: string}} props
 */
export default function CapacityBar({
  logged, planned, compact = false, label = 'planned',
}) {
  const used = Number(logged || 0);
  const plan = Number(planned || 0);
  const ratio = plan > 0 ? used / plan : 0;
  const fill = Math.min(ratio, 1) * 100;
  const over = ratio > 1;
  const pct = plan > 0 ? Math.round(ratio * 100) : null;
  const description = plan > 0
    ? `${formatHours(used)} logged of ${formatHours(plan)} ${label} (${pct}%)`
    : `${formatHours(used)} logged, no capacity planned yet`;

  return (
    <Box sx={{ minWidth: compact ? 120 : 200 }}>
      <Box
        role="meter"
        aria-label={description}
        aria-valuemin={0}
        aria-valuemax={plan || 0}
        aria-valuenow={used}
        sx={{
          position: 'relative',
          height: compact ? 10 : 16,
          borderRadius: '3px',
          bgcolor: '#EEF1EF',
          border: `1px solid ${tokens.line}`,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            width: `${fill}%`,
            bgcolor: over ? tokens.brick : tokens.marigold,
            transition: 'width 400ms ease-out',
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), ${tokens.paper} calc(10% - 1px), ${tokens.paper} 10%)`,
          }}
        />
      </Box>
      {!compact && (
        <Typography variant="body2" color={over ? 'error' : 'text.secondary'} sx={{ mt: 0.75 }}>
          {description}
          {over ? ' Over plan.' : ''}
        </Typography>
      )}
    </Box>
  );
}

CapacityBar.propTypes = {
  logged: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  planned: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  compact: PropTypes.bool,
  label: PropTypes.string,
};

import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

/** Colours a bar may take; the printed value always carries the meaning as well. */
const TONES = ['primary', 'secondary', 'success', 'warning', 'error', 'info'];

/**
 * A percentage printed as text with a thin bar beside it. The bar is decorative
 * (hidden from screen readers) and stops at 100%; the text shows the real value, so
 * 120% reads as "120%" with a full bar in the error colour.
 * @param {object} props - Component props.
 * @param {number|null} props.value - Percentage; null shows a dash and an empty bar.
 * @param {string} [props.suffix] - Text after the number, e.g. "allocated".
 * @param {'primary'|'secondary'|'success'|'warning'|'error'|'info'} [props.tone] - Bar colour.
 * @param {number} [props.digits] - Decimal places of the printed value.
 * @param {number|string} [props.barWidth] - Width of the bar.
 * @returns {JSX.Element} The bar.
 */
export default function PercentBar({ value, suffix, tone = 'primary', digits = 0, barWidth = 96 }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const text = known ? `${value.toFixed(digits)}%` : '—';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <LinearProgress
        variant="determinate"
        value={known ? Math.min(Math.max(value, 0), 100) : 0}
        color={tone}
        aria-hidden="true"
        sx={{ width: barWidth, flexShrink: 0, height: 6, borderRadius: 3 }}
      />
      <Typography component="span" variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {text}
        {suffix && known ? ` ${suffix}` : ''}
      </Typography>
    </Box>
  );
}

PercentBar.propTypes = {
  value: PropTypes.number,
  suffix: PropTypes.string,
  tone: PropTypes.oneOf(TONES),
  digits: PropTypes.number,
  barWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

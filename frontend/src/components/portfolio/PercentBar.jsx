import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

/**
 * A value out of 100 printed as text with a thin bar beside it (a meter). The bar is
 * decorative (hidden from screen readers) and stops at 100; the text shows the real value,
 * so a 120% load reads "120%" next to a full bar in the error colour.
 * @param {object} props - Component props.
 * @param {number|null} props.value - Value out of 100; null shows a dash and an empty bar.
 * @param {string} [props.unit] - Printed right after the number ("%" by default; "" for scores).
 * @param {string} [props.suffix] - Text after the value, e.g. "of 100".
 * @param {string} [props.tone] - Bar colour: a theme palette key such as primary, error or riskHigh.
 * @param {number} [props.digits] - Decimal places of the printed value.
 * @param {number|string} [props.barWidth] - Width of the bar.
 * @returns {JSX.Element} The bar.
 */
export default function PercentBar({ value, unit = '%', suffix, tone = 'primary', digits = 0, barWidth = 96 }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const text = known ? `${value.toFixed(digits)}${unit}` : '—';
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
  unit: PropTypes.string,
  suffix: PropTypes.string,
  tone: PropTypes.string,
  digits: PropTypes.number,
  barWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

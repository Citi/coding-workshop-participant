import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

const TONES = ['default', 'primary', 'success', 'warning', 'error', 'info'];

/**
 * Headline number tile for dashboards. The tone colours the accent bar and icon only;
 * the label always says what the number means.
 * @param {object} props - Component props.
 * @param {string} props.label - What the number is.
 * @param {import('react').ReactNode} props.value - The number (or MoneyText, etc.).
 * @param {import('react').ReactNode} [props.hint] - Context under the value.
 * @param {import('react').ReactNode} [props.icon] - Decorative icon.
 * @param {'default'|'primary'|'success'|'warning'|'error'|'info'} [props.tone] - Accent colour.
 * @param {boolean} [props.loading] - Show a skeleton instead of the value.
 * @returns {JSX.Element} The tile.
 */
export default function KpiTile({ label, value, hint, icon, tone = 'default', loading = false }) {
  const accent = tone === 'default' ? 'divider' : `${tone}.main`;
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        borderLeftWidth: 4,
        borderLeftColor: accent,
      }}
    >
      {icon ? (
        <Box aria-hidden="true" sx={{ color: tone === 'default' ? 'text.secondary' : accent, mt: 0.5 }}>
          {icon}
        </Box>
      ) : null}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" component="p" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width={96} sx={{ fontSize: '2rem' }} />
        ) : (
          <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
        )}
        {hint ? (
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

KpiTile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  hint: PropTypes.node,
  icon: PropTypes.node,
  tone: PropTypes.oneOf(TONES),
  loading: PropTypes.bool,
};

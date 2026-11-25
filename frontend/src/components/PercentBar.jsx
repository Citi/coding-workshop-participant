import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { formatPercent } from '../utils/format'

/**
 * Labelled progress bar (value is a percentage; the bar is capped at 100 but the label is not).
 * compact: a narrower minimum for crowded tables (bar 40px beside the 48px label), e.g. the
 * Projects list with two bars beside the side menu at 1200-1279px; the bar still grows into
 * whatever room the cell has.
 */
export default function PercentBar({ value, color = 'primary', label, compact = false, minWidth = compact ? 96 : 120 }) {
  const numeric = value === null || value === undefined ? null : Number(value)
  const text = label ?? formatPercent(numeric)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth }}>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, numeric ?? 100))}
        color={color}
        sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
        aria-label={text}
      />
      <Typography variant="body2" color="textSecondary" sx={{ minWidth: 48, textAlign: 'right' }}>
        {text}
      </Typography>
    </Box>
  )
}

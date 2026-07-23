import { Box, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { formatCurrency, formatPercent, ratio } from '../../utils/formatters';

/**
 * Consumed-versus-planned bar for one project.
 *
 * The bar is capped at 100% so an overspend cannot render past its track, but
 * the label always shows the true figure -- clamping the number too would hide
 * the very thing the report exists to surface.
 */
export default function BudgetBar({ planned, consumed, showLabels = true, warnAt = 0.8 }) {
  const used = ratio(consumed, planned);
  const isOverspent = used > 1;
  const isNearLimit = !isOverspent && used >= warnAt;

  const color = isOverspent ? 'error' : isNearLimit ? 'warning' : 'success';
  const remaining = Number(planned || 0) - Number(consumed || 0);

  // A project with no planned budget has no ratio to report -- not infinity.
  const hasPlan = Number(planned) > 0;

  return (
    <Box sx={{ minWidth: 140 }}>
      {showLabels && (
        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {formatCurrency(consumed)} of {formatCurrency(planned)}
          </Typography>
          <Typography variant="caption" color={`${color}.main`} fontWeight={600}>
            {hasPlan ? formatPercent(used) : '—'}
          </Typography>
        </Stack>
      )}

      <Tooltip
        title={
          isOverspent
            ? `Over budget by ${formatCurrency(Math.abs(remaining))}`
            : `${formatCurrency(remaining)} remaining`
        }
      >
        <LinearProgress
          variant="determinate"
          value={hasPlan ? Math.min(100, Math.max(0, used * 100)) : 0}
          color={color}
          aria-label={`Budget consumed: ${hasPlan ? formatPercent(used) : 'no planned budget'}`}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Tooltip>
    </Box>
  );
}

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import { Link as RouterLink } from 'react-router-dom';
import useApi from '../../hooks/useApi';
import { getUtilization } from '../../services/reportService';
import { formatPercent } from '../../utils/formatters';

/**
 * "Which team members are over-allocated across multiple projects?"
 *
 * Sorted by load descending and truncated, so the people needing attention are
 * the ones on screen. Anyone over capacity is coloured as an error, and the
 * percentage label carries the same information for anyone who cannot
 * distinguish the colours.
 */
export default function UtilizationWidget({ limit = 6 }) {
  const { data, error, loading, refresh } = useApi(getUtilization, {
    immediate: true,
    initialData: [],
  });

  const rows = Array.isArray(data) ? data : [];
  const ranked = [...rows]
    .sort((a, b) => Number(b.allocatedPct ?? 0) - Number(a.allocatedPct ?? 0))
    .slice(0, limit);

  const overAllocated = rows.filter((row) => row.isOverAllocated);

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <GroupIcon color="primary" aria-hidden="true" />
        <Typography variant="h3" component="h3" sx={{ flexGrow: 1 }}>
          Resource utilization
        </Typography>
        <Button size="small" component={RouterLink} to="/resources">
          Manage
        </Button>
      </Stack>

      <Box sx={{ flexGrow: 1, p: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }} role="status">
            <CircularProgress size={28} aria-label="Loading utilization" />
          </Box>
        )}

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={refresh}>
                Retry
              </Button>
            }
          >
            {error.message}
          </Alert>
        )}

        {!loading && !error && ranked.length === 0 && (
          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
            No resources have been allocated yet.
          </Typography>
        )}

        {!loading && !error && ranked.length > 0 && (
          <>
            {overAllocated.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {overAllocated.length} {overAllocated.length === 1 ? 'person is' : 'people are'}{' '}
                allocated beyond capacity.
              </Alert>
            )}

            <Stack spacing={2}>
              {ranked.map((row) => {
                const allocated = Number(row.allocatedPct ?? 0);
                const capacity = Number(row.capacityPct ?? 100);
                const isOver = row.isOverAllocated;

                return (
                  <Box key={row.resourceId}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                        {row.fullName}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {' '}
                          · {row.projectCount}{' '}
                          {row.projectCount === 1 ? 'project' : 'projects'}
                        </Typography>
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        color={isOver ? 'error.main' : 'text.secondary'}
                      >
                        {allocated}% of {capacity}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      // Capped so an over-allocation cannot overflow the track;
                      // the label above still reports the true figure.
                      value={Math.min(100, allocated)}
                      color={isOver ? 'error' : allocated >= capacity * 0.85 ? 'warning' : 'primary'}
                      aria-label={`${row.fullName} is ${formatPercent(row.utilization)} allocated`}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                );
              })}
            </Stack>
          </>
        )}
      </Box>
    </Paper>
  );
}

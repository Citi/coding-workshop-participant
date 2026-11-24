import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PercentBar from './PercentBar.jsx';
import { FULL_LOAD, allocationTarget, formatWindow, loadTone } from './capacityUtils.js';

const allocationShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  project_id: PropTypes.number,
  project_name: PropTypes.string,
  deliverable_id: PropTypes.number,
  deliverable_title: PropTypes.string,
  allocation_percentage: PropTypes.number,
  start_date: PropTypes.string,
  end_date: PropTypes.string,
});

const conflictShape = PropTypes.shape({
  start_date: PropTypes.string.isRequired,
  end_date: PropTypes.string.isRequired,
  load: PropTypes.number.isRequired,
  allocations: PropTypes.arrayOf(allocationShape),
});

const employeeShape = PropTypes.shape({
  user_id: PropTypes.number.isRequired,
  user_name: PropTypes.string.isRequired,
  segments: PropTypes.arrayOf(
    PropTypes.shape({
      start_date: PropTypes.string.isRequired,
      end_date: PropTypes.string.isRequired,
      load: PropTypes.number.isRequired,
    }),
  ),
  conflicts: PropTypes.arrayOf(conflictShape),
  is_compound_bottleneck: PropTypes.bool,
  bottleneck_deliverables: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.number, title: PropTypes.string, project_id: PropTypes.number }),
  ),
});

function ConflictWindow({ conflict }) {
  const over = conflict.load - FULL_LOAD;
  const allocations = conflict.allocations ?? [];
  return (
    <Paper variant="outlined" component="li" sx={{ p: 1.5, borderLeftWidth: 4, borderLeftColor: 'error.main' }}>
      <Typography variant="subtitle2" component="p">
        {conflict.load}% allocated, {formatWindow(conflict.start_date, conflict.end_date)}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {over} percentage point{over === 1 ? '' : 's'} over capacity. Contributing allocations:
      </Typography>
      <List dense disablePadding>
        {allocations.map((allocation) => (
          <ListItem key={allocation.id} disableGutters>
            <ListItemText
              primary={`${allocation.project_name} · ${allocationTarget(allocation)}`}
              secondary={`${allocation.allocation_percentage}% from ${formatWindow(allocation.start_date, allocation.end_date)}`}
              slotProps={{ primary: { sx: { overflowWrap: 'anywhere' } } }}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}

ConflictWindow.propTypes = {
  conflict: conflictShape.isRequired,
};

/**
 * Expanded view of one person on the capacity page: each over-allocation window with the
 * allocations behind it, the compound-bottleneck explanation, and the load over time.
 * @param {object} props - Component props.
 * @param {object} props.employee - One `employees` item of `GET /analytics/capacity`.
 * @param {Map<number, string>} [props.projectNames] - Project names by id, for bottleneck links.
 * @returns {JSX.Element} The detail panel.
 */
export default function EmployeeCapacityDetail({ employee, projectNames }) {
  const conflicts = employee.conflicts ?? [];
  const segments = employee.segments ?? [];
  const bottlenecks = employee.bottleneck_deliverables ?? [];

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 7 }}>
        <Stack spacing={2}>
          {employee.is_compound_bottleneck ? (
            <Alert severity="warning">
              <AlertTitle>Compound bottleneck</AlertTitle>
              {employee.user_name} is over-allocated while responsible for work that is blocked, overdue or
              held up by a blocker:{' '}
              {bottlenecks.map((deliverable, index) => (
                <Box component="span" key={deliverable.id}>
                  {index > 0 ? ', ' : ''}
                  <Link component={RouterLink} to={`/projects/${deliverable.project_id}?tab=risk`}>
                    {deliverable.title}
                  </Link>
                  {projectNames?.get(deliverable.project_id) ? ` (${projectNames.get(deliverable.project_id)})` : ''}
                </Box>
              ))}
              .
            </Alert>
          ) : null}
          <Box component="section" aria-label={`Over-allocation windows for ${employee.user_name}`}>
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Over-allocation windows
            </Typography>
            {conflicts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No window above 100% in this period.
              </Typography>
            ) : (
              <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {conflicts.map((conflict) => (
                  <ConflictWindow key={`${conflict.start_date}-${conflict.end_date}`} conflict={conflict} />
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <Box component="section" aria-label={`Load over time for ${employee.user_name}`}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
            Load over time
          </Typography>
          {segments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No allocations in this period.
            </Typography>
          ) : (
            <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {segments.map((segment) => (
                <Box component="li" key={`${segment.start_date}-${segment.end_date}`}>
                  <Typography variant="body2" color="text.secondary">
                    {formatWindow(segment.start_date, segment.end_date)}
                  </Typography>
                  <PercentBar value={segment.load} tone={loadTone(segment.load)} barWidth={140} />
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Grid>
    </Grid>
  );
}

EmployeeCapacityDetail.propTypes = {
  employee: employeeShape.isRequired,
  projectNames: PropTypes.instanceOf(Map),
};

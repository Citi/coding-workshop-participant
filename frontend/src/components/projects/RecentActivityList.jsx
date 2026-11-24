import { useId } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { describeAuditEntry } from './projectUtils.js';
import EmptyState from '../EmptyState.jsx';
import StatusChip from '../StatusChip.jsx';
import { formatDateTime } from '../../utils/format.js';

/**
 * One audit event: the action as a labelled chip, what changed (linked when it still
 * exists), who changed it and when.
 * @param {object} props - Component props.
 * @param {object} props.entry - AuditLogOut.
 * @returns {JSX.Element} The list item.
 */
function ActivityItem({ entry }) {
  const { typeLabel, name, href } = describeAuditEntry(entry);
  return (
    <ListItem divider disableGutters sx={{ display: 'block', py: 1.25 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusChip status={entry.action} variant="outlined" />
        <Typography variant="body2" component="span" sx={{ overflowWrap: 'anywhere' }}>
          {typeLabel}{' '}
          {href ? (
            <Link component={RouterLink} to={href}>
              {name}
            </Link>
          ) : (
            <Box component="span" sx={{ fontWeight: 600 }}>
              {name}
            </Box>
          )}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        {entry.actor_email ? `by ${entry.actor_email} · ` : ''}
        <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
      </Typography>
    </ListItem>
  );
}

ActivityItem.propTypes = {
  entry: PropTypes.shape({
    id: PropTypes.number.isRequired,
    action: PropTypes.string.isRequired,
    entity_type: PropTypes.string,
    entity_id: PropTypes.number,
    actor_email: PropTypes.string,
    created_at: PropTypes.string,
    before_state: PropTypes.object,
    after_state: PropTypes.object,
  }).isRequired,
};

/**
 * Dashboard card with the latest audit events, or an empty state before anything has been
 * changed (a freshly seeded portfolio has no audit rows). The API fills `recent_activity` for
 * ADMIN and PM only, so the dashboard shows this card only to roles that may read audit logs.
 * @param {object} props - Component props.
 * @param {object[]} props.entries - `recent_activity` from the dashboard API, newest first.
 * @param {boolean} [props.loading] - Show skeleton lines.
 * @returns {JSX.Element} The card.
 */
export default function RecentActivityList({ entries, loading = false }) {
  const headingId = useId();
  let body;
  if (loading) {
    body = (
      <Stack spacing={1.5} sx={{ mt: 1 }} data-testid="activity-skeleton">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} variant="rounded" height={48} />
        ))}
      </Stack>
    );
  } else if (entries.length === 0) {
    body = (
      <EmptyState
        icon={<HistoryOutlinedIcon />}
        title="No changes recorded yet"
        message="Every create, update and delete of a project, deliverable, dependency, allocation or budget entry appears here, newest first."
      />
    );
  } else {
    body = (
      <List disablePadding aria-labelledby={headingId}>
        {entries.map((entry) => (
          <ActivityItem key={entry.id} entry={entry} />
        ))}
      </List>
    );
  }
  return (
    <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography id={headingId} variant="h6" component="h2">
            Recent activity
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The latest changes, newest first.
          </Typography>
        </Box>
        <Button component={RouterLink} to="/audit" size="small" endIcon={<ArrowForwardIcon />} sx={{ flexShrink: 0 }}>
          Audit log
        </Button>
      </Box>
      {body}
    </Paper>
  );
}

RecentActivityList.propTypes = {
  entries: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
};

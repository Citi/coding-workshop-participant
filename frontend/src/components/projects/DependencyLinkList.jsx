import { useId } from 'react';
import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SectionHeader from './SectionHeader.jsx';
import ErrorState from '../ErrorState.jsx';
import EmptyState from '../EmptyState.jsx';

const linkShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  predecessor_deliverable_id: PropTypes.number,
  predecessor_title: PropTypes.string.isRequired,
  predecessor_project_id: PropTypes.number,
  successor_deliverable_id: PropTypes.number,
  successor_title: PropTypes.string.isRequired,
  successor_project_id: PropTypes.number,
});

/**
 * One dependency edge: "predecessor → successor", flagged when it crosses into another project,
 * with a remove button for roles that may delete dependencies.
 * @param {object} props - Component props.
 * @param {object} props.link - DependencyOut.
 * @param {number} props.projectId - The project being viewed.
 * @param {(link: object) => void} [props.onDelete] - Shows the remove button.
 * @returns {JSX.Element} The list item.
 */
function DependencyLinkItem({ link, projectId, onDelete }) {
  const crossesProjects = link.predecessor_project_id !== projectId || link.successor_project_id !== projectId;
  const label = `${link.predecessor_title} → ${link.successor_title}`;
  return (
    <ListItem
      divider
      secondaryAction={
        onDelete ? (
          <Tooltip title="Remove dependency">
            <IconButton edge="end" color="error" aria-label={`Remove dependency ${label}`} onClick={() => onDelete(link)}>
              <LinkOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : undefined
      }
    >
      <ListItemText
        primary={label}
        secondary={`${link.successor_title} waits for ${link.predecessor_title}`}
        slotProps={{ primary: { sx: { overflowWrap: 'anywhere' } }, secondary: { sx: { overflowWrap: 'anywhere' } } }}
      />
      {crossesProjects ? <Chip size="small" variant="outlined" label="Other project" sx={{ ml: 1 }} /> : null}
    </ListItem>
  );
}

DependencyLinkItem.propTypes = {
  link: linkShape.isRequired,
  projectId: PropTypes.number.isRequired,
  onDelete: PropTypes.func,
};

/**
 * The dependency edges that touch a project, each removable by ADMIN and PM (with a confirm
 * step owned by the caller).
 * @param {object} props - Component props.
 * @param {object[]} [props.links] - DependencyOut items.
 * @param {number} props.projectId - The project being viewed.
 * @param {boolean} [props.loading] - Show skeletons.
 * @param {Error|null} [props.error] - Show an error with a retry button.
 * @param {() => void} [props.onRetry] - Retry handler.
 * @param {(link: object) => void} [props.onDelete] - Shows remove buttons.
 * @returns {JSX.Element} The section.
 */
export default function DependencyLinkList({ links = [], projectId, loading = false, error = null, onRetry, onDelete }) {
  const headingId = useId();
  let body;
  if (error && links.length === 0) {
    body = <ErrorState error={error} onRetry={onRetry} />;
  } else if (loading && links.length === 0) {
    body = (
      <Stack spacing={1}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} variant="rounded" height={48} />
        ))}
      </Stack>
    );
  } else if (links.length === 0) {
    body = <EmptyState title="No dependencies yet" message="Link two deliverables to start a dependency chain." />;
  } else {
    body = (
      <List disablePadding aria-labelledby={headingId}>
        {links.map((link) => (
          <DependencyLinkItem key={link.id} link={link} projectId={projectId} onDelete={onDelete} />
        ))}
      </List>
    );
  }
  return (
    <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2 }}>
      <SectionHeader
        id={headingId}
        title="Dependency links"
        subtitle={loading && links.length === 0 ? 'Loading…' : `${links.length} link${links.length === 1 ? '' : 's'} touch this project`}
      />
      {body}
    </Paper>
  );
}

DependencyLinkList.propTypes = {
  links: PropTypes.arrayOf(linkShape),
  projectId: PropTypes.number.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.instanceOf(Error), PropTypes.object]),
  onRetry: PropTypes.func,
  onDelete: PropTypes.func,
};

import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';

/**
 * List of risk evidence lines or recommended actions (spec 9.4). Each line is plain text
 * built by the server from the same numbers as the risk points.
 * @param {object} props - Component props.
 * @param {string[]} [props.items] - Lines to show, in order.
 * @param {string} [props.title] - Heading above the list.
 * @param {'evidence'|'action'} [props.variant] - Icon style: a warning for evidence, a check for actions.
 * @param {string} [props.emptyMessage] - Shown when there are no lines.
 * @param {'h2'|'h3'|'h4'} [props.headingComponent] - Heading level for the title.
 * @returns {JSX.Element} The list.
 */
export default function EvidenceList({
  items = [],
  title,
  variant = 'evidence',
  emptyMessage = 'Nothing to report.',
  headingComponent = 'h3',
}) {
  const isAction = variant === 'action';
  return (
    <Box component="section" aria-label={title || (isAction ? 'Recommended actions' : 'Evidence')}>
      {title ? (
        <Typography variant="h6" component={headingComponent} gutterBottom>
          {title}
        </Typography>
      ) : null}
      {items.length === 0 ? (
        <Typography color="text.secondary">{emptyMessage}</Typography>
      ) : (
        <List dense disablePadding>
          {items.map((text, index) => (
            <ListItem key={`${index}-${text}`} disableGutters alignItems="flex-start">
              <ListItemIcon sx={{ minWidth: 32, mt: 0.75 }}>
                {isAction ? (
                  <TaskAltIcon fontSize="small" color="primary" aria-hidden="true" />
                ) : (
                  <ReportProblemOutlinedIcon fontSize="small" color="warning" aria-hidden="true" />
                )}
              </ListItemIcon>
              <ListItemText primary={text} />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}

EvidenceList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.string),
  title: PropTypes.string,
  variant: PropTypes.oneOf(['evidence', 'action']),
  emptyMessage: PropTypes.string,
  headingComponent: PropTypes.oneOf(['h2', 'h3', 'h4']),
};

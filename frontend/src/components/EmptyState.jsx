import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

/**
 * Friendly placeholder for an empty list or a page with nothing to show yet.
 * @param {object} props - Component props.
 * @param {string} [props.title] - Main line.
 * @param {import('react').ReactNode} [props.message] - Supporting text.
 * @param {import('react').ReactNode} [props.icon] - Icon element; defaults to an inbox.
 * @param {import('react').ReactNode} [props.action] - Optional button or link.
 * @returns {JSX.Element} The empty state.
 */
export default function EmptyState({ title = 'Nothing to show', message, icon, action }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1,
        py: 6,
        px: 2,
        color: 'text.secondary',
      }}
    >
      <Box aria-hidden="true" sx={{ '& svg': { fontSize: 48 }, color: 'action.active' }}>
        {icon ?? <InboxOutlinedIcon />}
      </Box>
      <Typography variant="h6" component="p" color="text.primary">
        {title}
      </Typography>
      {message ? (
        <Typography variant="body2" sx={{ maxWidth: 480 }}>
          {message}
        </Typography>
      ) : null}
      {action ? <Box sx={{ mt: 1 }}>{action}</Box> : null}
    </Box>
  );
}

EmptyState.propTypes = {
  title: PropTypes.string,
  message: PropTypes.node,
  icon: PropTypes.node,
  action: PropTypes.node,
};

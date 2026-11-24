import PropTypes from 'prop-types';
import Paper from '@mui/material/Paper';
import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import EmptyState from './EmptyState.jsx';

/**
 * Placeholder body for pages that are not built yet.
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} [props.message] - What the page will show.
 * @returns {JSX.Element} The placeholder.
 */
export default function ComingSoon({ message }) {
  return (
    <Paper variant="outlined">
      <EmptyState icon={<ConstructionOutlinedIcon />} title="Coming soon" message={message} />
    </Paper>
  );
}

ComingSoon.propTypes = {
  message: PropTypes.node,
};

import PropTypes from 'prop-types';
import { Chip } from '@mui/material';
import { MILESTONE_STATUS, PROJECT_STATUS } from '../utils/format';

/**
 * Colored status pill for projects and milestones, with an overdue variant.
 * @param {{status: string, kind?: 'project'|'milestone', overdue?: boolean}} props
 */
export default function StatusChip({ status, kind = 'project', overdue = false }) {
  const map = kind === 'milestone' ? MILESTONE_STATUS : PROJECT_STATUS;
  if (overdue) {
    return <Chip size="small" color="error" variant="outlined" label="Overdue" />;
  }
  const entry = map[status] || { label: status, color: 'default' };
  return <Chip size="small" color={entry.color} variant={entry.color === 'default' ? 'outlined' : 'filled'} label={entry.label} />;
}

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
  kind: PropTypes.oneOf(['project', 'milestone']),
  overdue: PropTypes.bool,
};

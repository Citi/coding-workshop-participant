import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import { ROLE_LABELS } from '../../constants.js';

/**
 * "Overdue" chip for a deliverable that is not done and past its due date. The word is
 * the signal; the error colour and icon only reinforce it.
 * @param {object} props - Component props.
 * @param {'small'|'medium'} [props.size] - Chip size.
 * @returns {JSX.Element} The chip.
 */
export function OverdueFlag({ size = 'small' }) {
  return (
    <Chip
      size={size}
      color="error"
      variant="outlined"
      icon={<EventBusyOutlinedIcon />}
      label="Overdue"
    />
  );
}

OverdueFlag.propTypes = {
  size: PropTypes.oneOf(['small', 'medium']),
};

/**
 * "Compound bottleneck" chip: an over-allocated person who also owns, or is allocated to,
 * a blocked, overdue or impacted deliverable (spec section 9.2).
 * @param {object} props - Component props.
 * @param {'small'|'medium'} [props.size] - Chip size.
 * @returns {JSX.Element} The chip.
 */
export function BottleneckFlag({ size = 'small' }) {
  return (
    <Chip size={size} color="warning" icon={<PriorityHighIcon />} label="Compound bottleneck" />
  );
}

BottleneckFlag.propTypes = {
  size: PropTypes.oneOf(['small', 'medium']),
};

/**
 * Role chip showing the rubric name (Admin, Manager, Contributor, Viewer).
 * @param {object} props - Component props.
 * @param {string} props.role - ADMIN, PM, LEAD or VIEWER.
 * @returns {JSX.Element} The chip.
 */
export function RoleChip({ role }) {
  const label = ROLE_LABELS[role] ?? role ?? 'Unknown';
  return (
    <Chip
      size="small"
      variant={role === 'ADMIN' ? 'filled' : 'outlined'}
      color={role === 'ADMIN' ? 'primary' : 'default'}
      icon={role === 'ADMIN' ? <ManageAccountsOutlinedIcon /> : undefined}
      label={label}
      title={`Role: ${label} (${role})`}
    />
  );
}

RoleChip.propTypes = {
  role: PropTypes.string,
};

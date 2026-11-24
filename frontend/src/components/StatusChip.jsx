import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import { STATUS_LABELS, humanize } from '../constants.js';
import { STATUS_COLORS } from '../theme.js';

/**
 * Status chip for projects, deliverables, capacity and audit actions. Colours come from
 * the theme's single STATUS_COLORS map and the label always spells out the status.
 * @param {object} props - Component props.
 * @param {string} props.status - API status value, e.g. ON_HOLD or BLOCKED.
 * @param {'small'|'medium'} [props.size] - Chip size.
 * @param {'filled'|'outlined'} [props.variant] - Overrides the default style.
 * @returns {JSX.Element} The chip.
 */
export default function StatusChip({ status, size = 'small', variant }) {
  const color = STATUS_COLORS[status] ?? 'default';
  const label = STATUS_LABELS[status] ?? (humanize(status) || 'Unknown');
  return (
    <Chip
      size={size}
      label={label}
      color={color}
      variant={variant ?? (color === 'default' ? 'outlined' : 'filled')}
    />
  );
}

StatusChip.propTypes = {
  status: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium']),
  variant: PropTypes.oneOf(['filled', 'outlined']),
};

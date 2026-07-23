import { Chip } from '@mui/material';
import {
  DELIVERABLE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  ROLE_LABELS,
  STATUS_COLOR,
} from '../../utils/constants';
import { humanise } from '../../utils/formatters';

/**
 * Renders a stored status, role or risk value as a colour-coded chip.
 *
 * The value passed in is always the raw database string; the label lookup
 * happens here so no caller has to remember that 'on_hold' displays as
 * "On Hold". Colour never carries the meaning alone -- the label is always
 * present -- so this stays readable in greyscale and for colour-blind users.
 */
export default function StatusChip({ value, size = 'small', variant = 'filled' }) {
  if (!value) return null;

  const label =
    PROJECT_STATUS_LABELS[value] ??
    DELIVERABLE_STATUS_LABELS[value] ??
    ROLE_LABELS[value] ??
    humanise(value);

  return (
    <Chip label={label} size={size} variant={variant} color={STATUS_COLOR[value] ?? 'default'} />
  );
}

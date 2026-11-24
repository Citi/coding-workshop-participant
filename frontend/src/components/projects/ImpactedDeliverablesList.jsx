import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { depthLabel } from './projectUtils.js';
import { IMPACTED_COLOR } from '../../theme.js';

/**
 * Deliverables put at risk by a blocked or overdue deliverable upstream: each with its
 * distance from the root cause and the root cause's title.
 * @param {object} props - Component props.
 * @param {Array<{id: number, title: string, depth: number, caused_by: string}>} props.items -
 *   `impacted_deliverables` from the risk detail.
 * @param {string} [props.ariaLabel] - Accessible name of the list.
 * @returns {JSX.Element} The list, or a sentence when nothing is impacted.
 */
export default function ImpactedDeliverablesList({ items, ariaLabel = 'Impacted deliverables' }) {
  if (items.length === 0) {
    return <Typography color="text.secondary">No deliverables are held up by a blocked or overdue item.</Typography>;
  }
  return (
    <List dense disablePadding aria-label={ariaLabel}>
      {items.map((item) => (
        <ListItem key={item.id} disableGutters divider data-testid={`impacted-${item.id}`}>
          <Chip
            size="small"
            color={IMPACTED_COLOR}
            icon={<WarningAmberIcon />}
            label="Impacted"
            sx={{ mr: 1.5, flexShrink: 0 }}
          />
          <ListItemText
            primary={item.title}
            secondary={`Held up by ${item.caused_by} · ${depthLabel(item.depth)}`}
            slotProps={{ primary: { sx: { fontWeight: 600, overflowWrap: 'anywhere' } } }}
          />
        </ListItem>
      ))}
    </List>
  );
}

ImpactedDeliverablesList.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      depth: PropTypes.number.isRequired,
      caused_by: PropTypes.string.isRequired,
    }),
  ).isRequired,
  ariaLabel: PropTypes.string,
};

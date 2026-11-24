import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import { formatShortWindow } from './capacityUtils.js';

/** Windows written out in a table cell; any further ones are counted. */
const SHOWN_WINDOWS = 2;

/**
 * A person's over-allocation windows for a table cell or card, each with its load and dates
 * ("120%: Nov 22 – Dec 6, 2026"), so who is over 100% and when is visible without opening
 * the row. The allocations behind each window are in the row's detail panel.
 * @param {object} props - Component props.
 * @param {Array<{start_date: string, end_date: string, load: number}>} [props.conflicts] - The
 *   person's `conflicts` from `GET /analytics/capacity`.
 * @returns {JSX.Element} The summary, or "None".
 */
export default function ConflictSummary({ conflicts = [] }) {
  if (conflicts.length === 0) {
    return <>None</>;
  }
  const shown = conflicts.slice(0, SHOWN_WINDOWS);
  const more = conflicts.length - shown.length;
  return (
    <Box component="span" sx={{ display: 'block' }}>
      {shown.map((conflict) => (
        <Box component="span" key={`${conflict.start_date}-${conflict.end_date}`} sx={{ display: 'block', fontWeight: 600 }}>
          {conflict.load}%: {formatShortWindow(conflict.start_date, conflict.end_date)}
        </Box>
      ))}
      {more > 0 ? (
        <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
          and {more} more window{more === 1 ? '' : 's'}
        </Box>
      ) : null}
    </Box>
  );
}

ConflictSummary.propTypes = {
  conflicts: PropTypes.arrayOf(
    PropTypes.shape({
      start_date: PropTypes.string.isRequired,
      end_date: PropTypes.string.isRequired,
      load: PropTypes.number.isRequired,
    }),
  ),
};

import { Fragment } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { EMPTY_VALUE } from '../../utils/format.js';

/**
 * Label and value pairs as a description list (`<dl>`), two columns wide.
 * @param {object} props - Component props.
 * @param {Array<{label: string, value: import('react').ReactNode}>} props.items - Pairs in display order;
 *   null, undefined and '' values show a dash.
 * @returns {JSX.Element} The list.
 */
export default function DetailList({ items }) {
  return (
    <Box
      component="dl"
      sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)', columnGap: 2, rowGap: 1, m: 0 }}
    >
      {items.map((item) => (
        <Fragment key={item.label}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {item.label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
            {item.value === null || item.value === undefined || item.value === '' ? EMPTY_VALUE : item.value}
          </Typography>
        </Fragment>
      ))}
    </Box>
  );
}

DetailList.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.node,
    }),
  ).isRequired,
};

import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import PropTypes from 'prop-types'

import { brand } from '../../theme'
import { SHOW_OPTIONS, showLabel } from '../../utils/myTicketFilters'

/**
 * Pill toggles for which tickets to list, each with its count ("Blocked 1"). One is
 * always selected. They wrap onto more lines on narrow screens.
 */
function StatusFilterChips({ value, counts, onChange }) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size="small"
      aria-label="Show tickets"
      onChange={(_event, next) => next && onChange(next)}
      sx={{
        flexWrap: 'wrap',
        gap: 1,
        '& .MuiToggleButtonGroup-grouped, & .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
          m: 0,
          height: 30,
          px: 1.5,
          border: 1,
          borderColor: '#D3DEE8',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          color: brand.inkSoft,
          bgcolor: 'background.paper',
          '&.Mui-selected, &.Mui-selected:hover': { bgcolor: brand.navy, borderColor: brand.navy, color: 'common.white' },
        },
      }}
    >
      {SHOW_OPTIONS.map((show) => (
        <ToggleButton key={show} value={show}>
          {showLabel(show)}{' '}
          <span style={{ marginLeft: 4, fontWeight: 500, opacity: 0.8 }}>{counts[show] ?? 0}</span>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

StatusFilterChips.propTypes = {
  value: PropTypes.oneOf(SHOW_OPTIONS).isRequired,
  counts: PropTypes.objectOf(PropTypes.number).isRequired,
  onChange: PropTypes.func.isRequired,
}

export default StatusFilterChips

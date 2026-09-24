import Box from '@mui/material/Box'
import PropTypes from 'prop-types'

import { STATUSES } from '../../utils/ticketFormat'

/**
 * A ticket status as a tinted pill, e.g. "In Progress" on light amber. The text carries
 * the meaning; each color pair passes AA contrast.
 */
function StatusChip({ status, size = 'medium' }) {
  const { label, chip } = STATUSES[status]
  const small = size === 'small'
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: small ? 22 : 26,
        px: small ? 1 : 1.5,
        borderRadius: 999,
        bgcolor: chip.bg,
        color: chip.fg,
        fontSize: small ? 12 : 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
    </Box>
  )
}

StatusChip.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  size: PropTypes.oneOf(['small', 'medium']),
}

export default StatusChip

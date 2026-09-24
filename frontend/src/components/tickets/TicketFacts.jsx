import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import {
  CATEGORIES,
  formatDateTime,
  formatLocation,
  SCOPES,
} from '../../utils/ticketFormat'

/**
 * The ticket's facts as a description list: two columns on larger screens.
 * Timestamps that haven't happened yet (e.g. resolved) are left out.
 */
function TicketFacts({ ticket }) {
  const facts = [
    ['Category', CATEGORIES[ticket.category]],
    ['Location', formatLocation(ticket)],
    ['Impact', SCOPES[ticket.affected_scope]],
    ['Assigned engineer', ticket.assigned_to_name ?? 'Not assigned yet'],
    ['Created', formatDateTime(ticket.created_at)],
    ['Last updated', formatDateTime(ticket.updated_at)],
    ticket.acknowledged_at && ['Acknowledged', formatDateTime(ticket.acknowledged_at)],
    ticket.assigned_at && ['Assigned', formatDateTime(ticket.assigned_at)],
    ticket.resolved_at && ['Resolved', formatDateTime(ticket.resolved_at)],
  ].filter(Boolean)

  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
        columnGap: 4,
        rowGap: 2,
      }}
    >
      {facts.map(([term, value]) => (
        <Box key={term}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {term}
          </Typography>
          <Typography component="dd" sx={{ m: 0 }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

TicketFacts.propTypes = {
  ticket: PropTypes.shape({
    category: PropTypes.string.isRequired,
    affected_scope: PropTypes.string.isRequired,
    assigned_to_name: PropTypes.string,
    created_at: PropTypes.string.isRequired,
    updated_at: PropTypes.string.isRequired,
    acknowledged_at: PropTypes.string,
    assigned_at: PropTypes.string,
    resolved_at: PropTypes.string,
  }).isRequired,
}

export default TicketFacts

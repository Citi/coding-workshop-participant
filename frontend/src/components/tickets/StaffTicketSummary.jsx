import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { PRIORITIES, SCOPES, STATUSES } from '../../utils/ticketFormat'
import EscalatedChip from './EscalatedChip'
import PriorityChip from './PriorityChip'
import StatusLabel from './StatusLabel'

/**
 * The top of a staff ticket page: "#id title", its priority, status and impact, and the
 * employee's escalation reason when they asked for review.
 * Staff screens only, since it shows priority.
 */
function StaffTicketSummary({ ticket: t }) {
  return (
    <>
      <Box>
        <Typography variant="h4" component="h1">
          #{t.ticket_id} {t.title}
        </Typography>
        {/* gap, not spacing: spacing's margins would indent items that wrap on phones. */}
        <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 1 }}>
          <PriorityChip priority={t.priority} />
          <StatusLabel status={t.status} />
          <Typography component="span" color="text.secondary">
            Impact: {SCOPES[t.affected_scope]}
          </Typography>
          {t.escalation_requested && <EscalatedChip />}
        </Stack>
      </Box>

      {t.escalation_requested && (
        <Alert severity="warning">
          <AlertTitle>{t.created_by_name} asked for an admin to review this ticket</AlertTitle>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{t.escalation_reason}</Typography>
        </Alert>
      )}
    </>
  )
}

StaffTicketSummary.propTypes = {
  ticket: PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    priority: PropTypes.oneOf(Object.keys(PRIORITIES)).isRequired,
    status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
    affected_scope: PropTypes.oneOf(Object.keys(SCOPES)).isRequired,
    escalation_requested: PropTypes.bool.isRequired,
    escalation_reason: PropTypes.string,
    created_by_name: PropTypes.string.isRequired,
  }).isRequired,
}

export default StaffTicketSummary

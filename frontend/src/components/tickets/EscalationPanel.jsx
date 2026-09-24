import { useState } from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'

import { ApiError } from '../../services/apiClient'
import { requestEscalation } from '../../services/ticketService'

const REASON_LIMIT = 1000

/** The card's frame: an icon and title, then the content. Named "Escalation" for screen readers. */
function EscalationCard({ title, children }) {
  return (
    <Card component="section" aria-label="Escalation" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PriorityHighIcon aria-hidden="true" sx={{ fontSize: 20, color: 'error.main' }} />
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Card>
  )
}

EscalationCard.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}

/**
 * Escalation, right on the page: the employee writes why and sends it. Once sent, the
 * card shows the request instead. A ticket can be escalated once, and not after it is
 * closed. Says "review", not "raise the priority": employees never see priority.
 */
function EscalationPanel({ ticket, onEscalated }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  if (ticket.escalation_requested) {
    return (
      <EscalationCard title="Escalation requested">
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>A Facility Admin will review it.</Typography>
        <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          Your reason: {ticket.escalation_reason}
        </Typography>
      </EscalationCard>
    )
  }
  if (ticket.status === 'closed') {
    return (
      <EscalationCard title="Request escalation">
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Closed tickets can&apos;t be escalated.</Typography>
      </EscalationCard>
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!reason.trim()) return setError('Tell the Facility Admin why this needs more attention.')
    if (reason.trim().length > REASON_LIMIT) return setError(`Use ${REASON_LIMIT} characters or fewer.`)

    setSending(true)
    try {
      await requestEscalation(ticket.ticket_id, reason)
      setReason('')
      onEscalated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
    return undefined
  }

  return (
    <EscalationCard title="Request escalation">
      <Typography sx={{ fontSize: 13, lineHeight: 1.45, color: 'text.secondary' }}>
        If this is getting worse or blocking important work, ask a Facility Admin to review it.
      </Typography>
      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          id="escalation-reason"
          label="Reason"
          multiline
          minRows={3}
          required
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            if (error) setError('')
          }}
          error={Boolean(error)}
          helperText={error || `${reason.trim().length}/${REASON_LIMIT}`}
          disabled={sending}
          fullWidth
        />
        <Button
          type="submit"
          variant="outlined"
          color="error"
          disabled={sending}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {sending ? 'Sending…' : 'Send escalation request'}
        </Button>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>A Facility Admin will review your request.</Typography>
    </EscalationCard>
  )
}

EscalationPanel.propTypes = {
  ticket: PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    escalation_requested: PropTypes.bool.isRequired,
    escalation_reason: PropTypes.string,
  }).isRequired,
  onEscalated: PropTypes.func.isRequired,
}

export default EscalationPanel

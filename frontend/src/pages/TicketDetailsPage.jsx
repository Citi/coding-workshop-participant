import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useLocation, useParams } from 'react-router'

import BackLink from '../components/BackLink'
import ErrorState from '../components/ErrorState'
import Panel from '../components/Panel'
import EscalationPanel from '../components/tickets/EscalationPanel'
import StatusHistory from '../components/tickets/StatusHistory'
import StatusLabel from '../components/tickets/StatusLabel'
import TicketFacts from '../components/tickets/TicketFacts'
import TicketNotes from '../components/tickets/TicketNotes'
import TicketWorkflow from '../components/tickets/TicketWorkflow'
import useApiData from '../hooks/useApiData'
import { addNote, getMyTicket, listNotes, listStatusHistory } from '../services/ticketService'
import { SCOPES } from '../utils/ticketFormat'

function BackToDashboard() {
  return <BackLink to="/dashboard">Back to dashboard</BackLink>
}

function NotFound() {
  return (
    <Stack spacing={2}>
      <BackToDashboard />
      <Card>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom>
            Ticket not found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            It may not exist, or it belongs to someone else.
          </Typography>
          <Button variant="contained" component={RouterLink} to="/dashboard">
            Go to my dashboard
          </Button>
        </CardContent>
      </Card>
    </Stack>
  )
}

/** Confirms a ticket just created on the Create Ticket page. Dismissible. */
function CreatedNotice() {
  const created = useLocation().state?.createdTicket
  const [dismissed, setDismissed] = useState(false)
  if (!created || dismissed) return null
  return (
    <Alert severity="success" onClose={() => setDismissed(true)}>
      Ticket created. We&apos;ll keep you posted here as it progresses.
    </Alert>
  )
}

/**
 * One of the employee's tickets: where it is in the workflow, how it got there,
 * its details, the notes conversation, and escalation.
 */
function TicketDetailsPage() {
  const { ticketId } = useParams()
  const validId = /^[1-9]\d{0,9}$/.test(ticketId)
  const ticket = useApiData(getMyTicket, { ticketId }, { skip: !validId })
  const history = useApiData(listStatusHistory, { ticketId }, { skip: !validId })
  const notes = useApiData(listNotes, { ticketId }, { skip: !validId })

  if (!validId || ticket.error?.status === 404) return <NotFound />
  if (ticket.error) {
    return (
      <Stack spacing={2}>
        <BackToDashboard />
        <ErrorState message={ticket.error.message} onRetry={ticket.reload} />
      </Stack>
    )
  }
  if (!ticket.data) {
    return (
      <Stack spacing={2} aria-label="Loading ticket" aria-busy="true">
        <Skeleton variant="text" width={240} />
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={220} />
      </Stack>
    )
  }

  const t = ticket.data
  // Notes and escalation change updated_at (and the escalation flag), so refresh both.
  const refresh = () => {
    ticket.reload()
    notes.reload()
  }

  return (
    <Stack spacing={3}>
      <BackToDashboard />
      <CreatedNotice />

      <Box>
        <Typography variant="h4" component="h1">
          #{t.ticket_id} {t.title}
        </Typography>
        {/* gap, not spacing: spacing's margins would indent items that wrap on phones. */}
        <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', columnGap: 3, rowGap: 1 }}>
          <StatusLabel status={t.status} />
          <Typography component="span" color="text.secondary">
            Impact: {SCOPES[t.affected_scope]}
          </Typography>
        </Stack>
      </Box>

      <Panel title="Progress">
        <TicketWorkflow status={t.status} blockedReason={t.blocked_reason} />
      </Panel>

      <Panel title="Status history">
        <StatusHistory history={history} />
      </Panel>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title="Details">
            <Typography sx={{ whiteSpace: 'pre-wrap', mb: 3 }}>{t.description}</Typography>
            <TicketFacts ticket={t} />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Panel title="Escalation">
            <EscalationPanel ticket={t} onEscalated={refresh} />
          </Panel>
        </Grid>
      </Grid>

      <Panel title="Notes">
        <TicketNotes
          ticketId={t.ticket_id}
          closed={t.status === 'closed'}
          notes={notes}
          addNote={addNote}
          placeholder="Add details, answer a question or tell the engineer what changed."
          onAdded={refresh}
        />
      </Panel>
    </Stack>
  )
}

export default TicketDetailsPage

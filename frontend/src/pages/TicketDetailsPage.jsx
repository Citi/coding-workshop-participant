import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PropTypes from 'prop-types'
import { Link as RouterLink, useLocation, useParams } from 'react-router'

import ErrorState from '../components/ErrorState'
import DetailsCard from '../components/tickets/DetailsCard'
import EscalationPanel from '../components/tickets/EscalationPanel'
import NoteComposer from '../components/tickets/NoteComposer'
import StatusChip from '../components/tickets/StatusChip'
import TicketStepper from '../components/tickets/TicketStepper'
import TicketThread from '../components/tickets/TicketThread'
import useApiData from '../hooks/useApiData'
import useIsDesktop from '../hooks/useIsDesktop'
import { addNote, getMyTicket, listNotes, listStatusHistory } from '../services/ticketService'
import { brand } from '../theme'
import { firstNameOf, initialsFor } from '../utils/people'
import { CATEGORIES, formatDateTime, formatLocation, SCOPES } from '../utils/ticketFormat'
import { formatDuration } from '../utils/ticketThread'
import { stepTimes } from '../utils/ticketWorkflow'

/** "Dashboard / #12". The ticket part is left out while it loads or isn't found. */
function Crumbs({ ticketId }) {
  return (
    <Breadcrumbs aria-label="Breadcrumb">
      <Link component={RouterLink} to="/dashboard" underline="hover" color="text.secondary">
        Dashboard
      </Link>
      {ticketId && (
        <Typography aria-current="page" sx={{ fontWeight: 600, color: 'text.primary' }}>
          #{ticketId}
        </Typography>
      )}
    </Breadcrumbs>
  )
}

Crumbs.propTypes = { ticketId: PropTypes.number }

function NotFound() {
  return (
    <Stack spacing={2}>
      <Crumbs />
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

/** The assigned engineer with their initials, or that nobody is on it yet. */
function Engineer({ name }) {
  if (!name) return <Box component="span" sx={{ color: 'text.secondary' }}>Not assigned yet</Box>
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Avatar aria-hidden="true" sx={{ width: 24, height: 24, fontSize: 10, fontWeight: 700, bgcolor: brand.navy }}>
        {initialsFor(name)}
      </Avatar>
      {name}
    </Box>
  )
}

Engineer.propTypes = { name: PropTypes.string }

/** Title, reference line, description, status and progress with the time of each step. */
function TicketHeader({ ticket: t, times }) {
  return (
    <Card sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            #{t.ticket_id} · {CATEGORIES[t.category]} · reported {formatDateTime(t.created_at)}
          </Typography>
          <Typography variant="h4" component="h1" sx={{ mt: 0.5, fontSize: { xs: 22, sm: 24 }, overflowWrap: 'anywhere' }}>
            {t.title}
          </Typography>
          <Typography sx={{ mt: 0.75, fontSize: 14, lineHeight: 1.5, color: brand.inkSoft, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {t.description}
          </Typography>
        </Box>
        <StatusChip status={t.status} />
      </Box>
      <TicketStepper status={t.status} times={times} blockedReason={t.blocked_reason ?? undefined} />
    </Card>
  )
}

TicketHeader.propTypes = {
  ticket: PropTypes.object.isRequired,
  times: PropTypes.objectOf(PropTypes.string).isRequired,
}

/**
 * One of the employee's tickets. The header shows what was reported and how far it has
 * come; "Updates & notes" merges status changes, the assignment and notes, with a box to
 * add one; Details and Escalation sit beside it on desktop and below the header on
 * smaller screens. Never shows priority.
 */
function TicketDetailsPage() {
  const { ticketId } = useParams()
  const isDesktop = useIsDesktop()
  const validId = /^[1-9]\d{0,9}$/.test(ticketId)
  const ticket = useApiData(getMyTicket, { ticketId }, { skip: !validId })
  const history = useApiData(listStatusHistory, { ticketId }, { skip: !validId })
  const notes = useApiData(listNotes, { ticketId }, { skip: !validId })

  if (!validId || ticket.error?.status === 404) return <NotFound />
  if (ticket.error) {
    return (
      <Stack spacing={2}>
        <Crumbs />
        <ErrorState message={ticket.error.message} onRetry={ticket.reload} />
      </Stack>
    )
  }
  if (!ticket.data) {
    return (
      <Stack spacing={2} aria-label="Loading ticket" aria-busy="true">
        <Skeleton variant="text" width={240} />
        <Skeleton variant="rounded" height={180} />
        <Skeleton variant="rounded" height={260} />
      </Stack>
    )
  }

  const t = ticket.data
  // Notes and escalation change updated_at (and the escalation flag), so refresh both.
  const refresh = () => {
    ticket.reload()
    notes.reload()
  }
  const engineer = t.assigned_to_name
  const details = (
    <DetailsCard
      rows={[
        ['Affects', SCOPES[t.affected_scope]],
        ['Location', formatLocation(t)],
        ['Category', CATEGORIES[t.category]],
        ['Engineer', <Engineer key="engineer" name={engineer} />],
        ['Acknowledged', t.acknowledged_at ? `${formatDuration(t.created_at, t.acknowledged_at)} after you reported it` : 'Not yet'],
        ['Last updated', formatDateTime(t.updated_at)],
        ...(t.resolved_at ? [['Resolved', formatDateTime(t.resolved_at)]] : []),
      ]}
    />
  )
  const escalation = <EscalationPanel ticket={t} onEscalated={refresh} />
  const thread = (
    <TicketThread
      history={history}
      notes={notes}
      assignment={{ name: engineer, at: t.assigned_at }}
      subtitle="Visible to you, the engineer and Facility Admins"
      closed={t.status === 'closed'}
      composer={
        <NoteComposer
          ticketId={t.ticket_id}
          addNote={addNote}
          placeholder={engineer ? `Add a note for ${firstNameOf(engineer)}…` : 'Add details or tell the team what changed…'}
          onAdded={refresh}
        />
      }
    />
  )
  const header = <TicketHeader ticket={t} times={history.data ? stepTimes(history.data) : {}} />

  return (
    <Stack spacing={2.5}>
      <Crumbs ticketId={t.ticket_id} />
      <CreatedNotice />

      {isDesktop ? (
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          <Stack spacing={2.25} sx={{ flex: 1, minWidth: 0 }}>
            {header}
            {thread}
          </Stack>
          <Stack spacing={2.25} sx={{ width: 360, flex: 'none' }}>
            {details}
            {escalation}
          </Stack>
        </Box>
      ) : (
        <Stack spacing={2.25}>
          {header}
          {details}
          {thread}
          {escalation}
        </Stack>
      )}
    </Stack>
  )
}

export default TicketDetailsPage

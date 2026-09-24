import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import PropTypes from 'prop-types'
import { Link as RouterLink } from 'react-router'

import useApiData from '../../hooks/useApiData'
import { getMyTicket, listNotes, listStatusHistory } from '../../services/ticketService'
import { brand } from '../../theme'
import { initialsFor } from '../../utils/people'
import { formatAgo, formatLocation, ROLES } from '../../utils/ticketFormat'
import { stepTimes } from '../../utils/ticketWorkflow'
import CategoryIcon from '../tickets/CategoryIcon'
import StatusChip from '../tickets/StatusChip'
import TicketStepper from '../tickets/TicketStepper'

/** The newest note from an engineer or admin, i.e. not from the employee themselves. */
function latestStaffNote(notes) {
  return notes
    .filter((note) => note.author_role !== 'employee')
    .reduce((latest, note) => (!latest || Date.parse(note.created_at) > Date.parse(latest.created_at) ? note : latest), null)
}

/** The latest message from the team working on the ticket, with a way to answer it. */
function LatestNote({ note, ticketId }) {
  if (!note) {
    return (
      <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
        No messages from the team yet. Their updates will show up here.
      </Typography>
    )
  }
  return (
    <Box
      data-testid="latest-message"
      sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', bgcolor: 'background.default', borderRadius: 1.25, px: 2, py: 1.75, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}
    >
      <Avatar aria-hidden="true" sx={{ width: 30, height: 30, fontSize: 12, fontWeight: 700, bgcolor: brand.navy }}>
        {initialsFor(note.author_name)}
      </Avatar>
      {/* On phones the text takes the full row, so Reply drops below it. */}
      <Box sx={{ flex: '1 1 0', minWidth: { xs: 'calc(100% - 42px)', sm: 0 } }}>
        <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
          <b>{note.author_name}</b>{' '}
          <Box component="span" sx={{ color: 'text.secondary' }}>
            · {ROLES[note.author_role] ?? note.author_role} · {formatAgo(note.created_at)}
          </Box>
        </Typography>
        <Typography
          sx={{
            mt: 0.25,
            fontSize: 14,
            lineHeight: 1.45,
            overflowWrap: 'anywhere',
            // Long messages show three lines here; the ticket page has the full text.
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {note.note_text}
        </Typography>
      </Box>
      <Button component={RouterLink} to={`/tickets/${ticketId}`} variant="outlined" size="small" sx={{ flex: 'none', ml: { xs: 5.25, sm: 0 } }}>
        Reply
      </Button>
    </Box>
  )
}

LatestNote.propTypes = {
  note: PropTypes.shape({
    author_name: PropTypes.string.isRequired,
    author_role: PropTypes.string.isRequired,
    note_text: PropTypes.string.isRequired,
    created_at: PropTypes.string.isRequired,
  }),
  ticketId: PropTypes.number.isRequired,
}

/**
 * The employee's most recently updated active ticket: what and where, who is on it, how
 * far it has come, and the team's latest message. The list row gives the basics; the
 * ticket's details, history and notes (existing endpoints) fill in the rest. If those
 * fail, the basics stay and a retry is offered.
 */
function ActiveTicketCard({ ticket }) {
  const params = { ticketId: ticket.ticket_id }
  const detail = useApiData(getMyTicket, params)
  const history = useApiData(listStatusHistory, params)
  const notes = useApiData(listNotes, params)
  const extras = [detail, history, notes]
  const failed = extras.some((part) => part.error)
  const loading = extras.some((part) => part.loading && part.data === undefined)
  const retry = () => extras.forEach((part) => part.error && part.reload())

  const engineer = detail.data?.assigned_to_name
  const assignment = detail.data && (engineer ? `Assigned to ${engineer}` : 'Waiting for an engineer')

  return (
    <Card component="section" aria-labelledby="active-ticket-title" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        <Box
          sx={{ width: 44, height: 44, flex: 'none', borderRadius: 1.25, bgcolor: brand.selected, color: brand.blue, display: { xs: 'none', sm: 'grid' }, placeItems: 'center' }}
        >
          <CategoryIcon category={ticket.category} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'primary.main' }}>
            Your active ticket{' '}
            <Box component="span" sx={{ ml: 0.5, fontSize: 13, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'text.secondary' }}>
              #{ticket.ticket_id}
            </Box>
          </Typography>
          <Typography id="active-ticket-title" component="h2" sx={{ fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>
            <Link component={RouterLink} to={`/tickets/${ticket.ticket_id}`} color="inherit" underline="hover">
              {ticket.title}
            </Link>
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {[formatLocation(ticket), assignment].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <StatusChip status={ticket.status} />
      </Box>

      {loading ? (
        <Box aria-busy="true" aria-label="Loading ticket progress">
          <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={64} />
        </Box>
      ) : (
        <>
          <TicketStepper
            status={ticket.status}
            times={history.data ? stepTimes(history.data) : {}}
            blockedReason={detail.data?.blocked_reason ?? undefined}
          />
          {notes.data && <LatestNote note={latestStaffNote(notes.data)} ticketId={ticket.ticket_id} />}
        </>
      )}

      {failed && (
        <Box role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Couldn&apos;t load the latest updates.</Typography>
          <Button size="small" onClick={retry}>
            Try again
          </Button>
        </Box>
      )}
    </Card>
  )
}

ActiveTicketCard.propTypes = {
  ticket: PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    category: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    building_name: PropTypes.string.isRequired,
  }).isRequired,
}

export default ActiveTicketCard

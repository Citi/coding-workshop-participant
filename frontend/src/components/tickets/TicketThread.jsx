import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import BlockIcon from '@mui/icons-material/Block'
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined'
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined'
import ReplayIcon from '@mui/icons-material/Replay'
import SyncIcon from '@mui/icons-material/Sync'
import PropTypes from 'prop-types'

import useAuth from '../../auth/useAuth'
import { brand } from '../../theme'
import { initialsFor } from '../../utils/people'
import { formatDateTime, ROLES } from '../../utils/ticketFormat'
import { buildThread } from '../../utils/ticketThread'
import ErrorState from '../ErrorState'

const EVENT_ICONS = {
  opened: AddCircleOutlineIcon,
  moved: SyncIcon,
  blocked: BlockIcon,
  unblocked: PlayCircleOutlinedIcon,
  reopened: ReplayIcon,
  assigned: PersonAddOutlinedIcon,
}

/** "You · Employee · Sep 22, 9:02 AM", or just the time for system events. */
function byline(by, at, userId) {
  if (!by) return formatDateTime(at)
  const name = by.id === userId ? 'You' : by.name
  return `${name} · ${ROLES[by.role] ?? by.role} · ${formatDateTime(at)}`
}

/** A status change: a small icon, what happened, who and when, and any reason. */
function EventItem({ item, userId }) {
  const Icon = EVENT_ICONS[item.event] ?? SyncIcon
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', pl: 0.75, fontSize: 13, color: 'text.secondary' }}>
      <Icon aria-hidden="true" sx={{ fontSize: 17, mt: 0.125, color: item.event === 'blocked' ? 'error.main' : '#7A8A9A' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {item.label}
          </Box>
          <span>{byline(item.by, item.at, userId)}</span>
        </Box>
        {item.reason && (
          <Typography sx={{ mt: 0.25, fontSize: 13, color: brand.inkSoft, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {item.reason}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

EventItem.propTypes = {
  item: PropTypes.object.isRequired,
  userId: PropTypes.number.isRequired,
}

/** A note: the author's initials, who and when, and the text in a bubble. */
function NoteItem({ item, userId }) {
  const mine = item.by.id === userId
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Avatar
        aria-hidden="true"
        sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: mine ? brand.selected : brand.navy, color: mine ? brand.navy : 'common.white' }}
      >
        {initialsFor(item.by.name)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13 }}>
          <b>{mine ? 'You' : item.by.name}</b>{' '}
          <Box component="span" sx={{ color: 'text.secondary' }}>
            · {ROLES[item.by.role] ?? item.by.role} · {formatDateTime(item.at)}
          </Box>
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            px: 1.75,
            py: 1.25,
            borderRadius: 1.25,
            fontSize: 14,
            lineHeight: 1.5,
            bgcolor: mine ? brand.page : '#EEF5FB',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {item.text}
        </Typography>
      </Box>
    </Box>
  )
}

NoteItem.propTypes = {
  item: PropTypes.object.isRequired,
  userId: PropTypes.number.isRequired,
}

/**
 * "Updates & notes": status changes, the assignment and the notes in one timeline,
 * oldest first, with `composer` (or a closed notice) underneath. `history` and `notes`
 * are useApiData results; either failing shows a retry instead of a partial timeline.
 */
function TicketThread({ history, notes, assignment, subtitle, closed, composer }) {
  const { user } = useAuth()
  const failed = [history, notes].find((part) => part.error)
  const loading = [history, notes].some((part) => part.loading && !part.data)
  const thread = buildThread({ history: history.data ?? [], notes: notes.data ?? [], assignment })

  let body
  if (failed) body = <ErrorState message={failed.error.message} onRetry={failed.reload} />
  else if (loading) body = <Skeleton variant="rounded" height={120} aria-label="Loading updates" />
  else if (thread.length === 0) body = <Typography color="text.secondary">No updates yet.</Typography>
  else {
    body = (
      <Box component="ol" aria-label="Updates and notes" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        {thread.map((item) =>
          item.kind === 'note' ? (
            <NoteItem key={item.key} item={item} userId={user.user_id} />
          ) : (
            <EventItem key={item.key} item={item} userId={user.user_id} />
          ),
        )}
      </Box>
    )
  }

  return (
    <Card component="section" aria-labelledby="thread-title">
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1.5, rowGap: 0.25 }}>
        <Typography id="thread-title" component="h2" sx={{ fontSize: 16, fontWeight: 600, flex: 1 }}>
          Updates &amp; notes
        </Typography>
        {subtitle && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{subtitle}</Typography>}
      </Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>{body}</Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.75, borderTop: 1, borderColor: 'divider' }}>
        {closed ? <Alert severity="info">This ticket is closed, so new notes can&apos;t be added.</Alert> : composer}
      </Box>
    </Card>
  )
}

const loadShape = PropTypes.shape({
  data: PropTypes.array,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.instanceOf(Error),
  reload: PropTypes.func.isRequired,
})

TicketThread.propTypes = {
  history: loadShape.isRequired,
  notes: loadShape.isRequired,
  assignment: PropTypes.shape({ name: PropTypes.string, at: PropTypes.string }),
  subtitle: PropTypes.string,
  closed: PropTypes.bool.isRequired,
  composer: PropTypes.node,
}

export default TicketThread

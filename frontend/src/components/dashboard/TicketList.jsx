import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import CardActionArea from '@mui/material/CardActionArea'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

import useIsDesktop from '../../hooks/useIsDesktop'
import useIsMobile from '../../hooks/useIsMobile'
import { formatDateTime, formatLocation, SCOPES } from '../../utils/ticketFormat'
import StatusChip from '../tickets/StatusChip'
import UrgencyLabel from '../tickets/UrgencyLabel'

// One line per cell; the full text is in the cell's tooltip.
const oneLine = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

const headCell = { fontSize: 12, fontWeight: 600, color: 'text.secondary', bgcolor: '#FAFCFD', py: 1.25 }

/** Phones: one tappable card per ticket. */
function TicketCards({ tickets }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {tickets.map((t) => (
        <Box component="li" key={t.ticket_id} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
          <CardActionArea component={RouterLink} to={`/tickets/${t.ticket_id}`} sx={{ px: 2, py: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>
                #{t.ticket_id} {t.title}
              </Typography>
              <StatusChip status={t.status} size="small" />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
              {formatLocation(t)}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 0.5, fontSize: 13, color: 'text.secondary' }}>
              <UrgencyLabel urgency={t.urgency} />
              <span>{SCOPES[t.affected_scope]}</span>
              <span>Updated {formatDateTime(t.updated_at)}</span>
            </Box>
          </CardActionArea>
        </Box>
      ))}
    </Box>
  )
}

TicketCards.propTypes = { tickets: PropTypes.array.isRequired }

/**
 * The employee's tickets. Desktop: a full table. Tablet: no Impact column, and the
 * location sits under the title so the title keeps its room. Phone: stacked cards. Long titles and locations stay on one line in the table, with
 * the full text on hover; cards wrap them instead. Each ticket links to its details.
 * Never shows priority: employees see urgency and impact.
 */
function TicketList({ tickets }) {
  const isMobile = useIsMobile()
  const isDesktop = useIsDesktop()

  if (isMobile) return <TicketCards tickets={tickets} />

  return (
    <TableContainer>
      <Table size="small" aria-label="My tickets" sx={{ tableLayout: 'fixed', minWidth: 560 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...headCell, width: 72, pl: 2.5 }}>#</TableCell>
            <TableCell sx={headCell}>{isDesktop ? 'Title' : 'Title and location'}</TableCell>
            {isDesktop && <TableCell sx={{ ...headCell, width: '24%' }}>Location</TableCell>}
            <TableCell sx={{ ...headCell, width: 128 }}>Status</TableCell>
            <TableCell sx={{ ...headCell, width: 104 }}>Urgency</TableCell>
            {isDesktop && <TableCell sx={{ ...headCell, width: 104 }}>Impact</TableCell>}
            <TableCell sx={{ ...headCell, width: 150, pr: 2.5 }}>Updated</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((t) => {
            const location = formatLocation(t)
            return (
              <TableRow key={t.ticket_id} hover sx={{ '& td': { py: 1.5, fontSize: 14 } }}>
                <TableCell sx={{ pl: 2.5, color: 'primary.main', fontWeight: 600 }}>#{t.ticket_id}</TableCell>
                <TableCell sx={{ ...oneLine, fontWeight: 500 }} title={t.title}>
                  <Link component={RouterLink} to={`/tickets/${t.ticket_id}`} color="inherit" underline="hover">
                    {t.title}
                  </Link>
                  {!isDesktop && (
                    <Box title={location} sx={{ ...oneLine, fontSize: 13, fontWeight: 400, color: 'text.secondary' }}>
                      {location}
                    </Box>
                  )}
                </TableCell>
                {isDesktop && (
                  <TableCell sx={{ ...oneLine, fontSize: '13px !important', color: 'text.secondary' }} title={location}>
                    {location}
                  </TableCell>
                )}
                <TableCell>
                  <StatusChip status={t.status} size="small" />
                </TableCell>
                <TableCell sx={{ fontSize: '13px !important' }}>
                  <UrgencyLabel urgency={t.urgency} />
                </TableCell>
                {isDesktop && <TableCell sx={{ fontSize: '13px !important' }}>{SCOPES[t.affected_scope]}</TableCell>}
                <TableCell sx={{ pr: 2.5, whiteSpace: 'nowrap', fontSize: '13px !important', color: 'text.secondary' }}>
                  {formatDateTime(t.updated_at)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

TicketList.propTypes = {
  tickets: PropTypes.arrayOf(
    PropTypes.shape({
      ticket_id: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      urgency: PropTypes.string.isRequired,
      affected_scope: PropTypes.string.isRequired,
      building_name: PropTypes.string.isRequired,
      updated_at: PropTypes.string.isRequired,
    }),
  ).isRequired,
}

export default TicketList

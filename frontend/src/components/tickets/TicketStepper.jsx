import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import BlockIcon from '@mui/icons-material/Block'
import CheckIcon from '@mui/icons-material/Check'
import PropTypes from 'prop-types'

import useIsMobile from '../../hooks/useIsMobile'
import { brand } from '../../theme'
import { formatDateTime, STATUSES } from '../../utils/ticketFormat'
import { workflowState } from '../../utils/ticketWorkflow'

const NODE = 26
const LINE = '#D3DEE8'
const BLOCKED = STATUSES.blocked.chip.fg

// Hidden visually but read by screen readers.
const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

const STATE_TEXT = {
  done: 'done',
  current: 'current status',
  paused: 'paused while blocked',
  upcoming: 'not reached yet',
}

/** The numbered circle: a check when done, a block sign while blocked, else the number. */
function Node({ state, number }) {
  const styles = {
    done: { bgcolor: brand.blue, borderColor: brand.blue, color: 'common.white' },
    current: { bgcolor: 'background.paper', borderColor: brand.blue, color: brand.blue },
    paused: { bgcolor: BLOCKED, borderColor: BLOCKED, color: 'common.white' },
    upcoming: { bgcolor: 'background.paper', borderColor: LINE, color: 'text.secondary' },
  }[state]
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: NODE,
        height: NODE,
        flex: 'none',
        borderRadius: '50%',
        border: 2,
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        fontSize: 12,
        fontWeight: 700,
        ...styles,
      }}
    >
      {state === 'done' && <CheckIcon sx={{ fontSize: 16 }} />}
      {state === 'paused' && <BlockIcon sx={{ fontSize: 15 }} />}
      {(state === 'current' || state === 'upcoming') && number}
    </Box>
  )
}

Node.propTypes = {
  state: PropTypes.oneOf(['done', 'current', 'paused', 'upcoming']).isRequired,
  number: PropTypes.number.isRequired,
}

/**
 * Compact progress: Open -> In Progress -> Resolved -> Closed, with when each step was
 * reached. Blocked is a side state, not a step: a blocked ticket pauses on In Progress
 * with "Blocked: <reason>" right under it. Across on larger screens, down on phones.
 */
function TicketStepper({ status, times = {}, blockedReason }) {
  const vertical = useIsMobile()
  const { steps, blocked } = workflowState(status)

  return (
    <Box
      component="ol"
      aria-label="Ticket progress"
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: vertical ? 'column' : 'row' }}
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        const reached = step.state !== 'upcoming'
        const nextReached = !last && steps[index + 1].state !== 'upcoming'
        const emphasised = step.state === 'current' || step.state === 'paused'
        const time = reached && times[step.status]
        return (
          <Box
            component="li"
            key={step.status}
            aria-current={emphasised ? 'step' : undefined}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: vertical ? 'row' : 'column',
              gap: vertical ? 1.5 : 1,
              position: 'relative',
              pb: vertical && !last ? 2.5 : 0,
              // Connector to the next step: across on larger screens, down on phones.
              '&::after': !last && {
                content: '""',
                position: 'absolute',
                bgcolor: nextReached ? brand.blue : LINE,
                ...(vertical
                  ? { left: NODE / 2 - 1, top: NODE + 4, bottom: 4, width: 2 }
                  : { top: NODE / 2 - 1, left: NODE + 8, right: 8, height: 2 }),
              },
            }}
          >
            <Node state={step.state} number={index + 1} />
            <Box sx={{ minWidth: 0, pr: 1 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: emphasised ? 700 : 500,
                  color: reached ? 'text.primary' : 'text.secondary',
                }}
              >
                {STATUSES[step.status].label}
                <Box component="span" sx={srOnly}>
                  {' '}
                  ({STATE_TEXT[step.state]})
                </Box>
              </Typography>
              {time && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{formatDateTime(time)}</Typography>
              )}
              {step.status === 'in_progress' && blocked && (
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: BLOCKED, mt: 0.25, overflowWrap: 'anywhere' }}>
                  Blocked{blockedReason ? `: ${blockedReason}` : ''}
                </Typography>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

TicketStepper.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  times: PropTypes.objectOf(PropTypes.string),
  blockedReason: PropTypes.string,
}

export default TicketStepper

import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import StatusChip from '../../components/StatusChip'
import { useIsMobile } from '../../hooks/useIsMobile'

/**
 * Health chip; on desktop the triggered health rules show in a tooltip (on hover or keyboard focus).
 * Completed/cancelled projects have no health and show '—'.
 */
export default function ProjectHealthChip({ health, reasons }) {
  const isMobile = useIsMobile()
  if (!health) {
    return (
      <Typography component="span" variant="body2" color="textSecondary">
        —
      </Typography>
    )
  }
  const chip = <StatusChip kind="health" value={health} />
  // On mobile the whole card is one button, so it must not contain another focusable element.
  if (isMobile || !reasons?.length) return chip
  return (
    <Tooltip arrow describeChild title={<ReasonList reasons={reasons} />}>
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: 'inline-flex',
          borderRadius: 4,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        {chip}
      </Box>
    </Tooltip>
  )
}

function ReasonList({ reasons }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </Box>
  )
}

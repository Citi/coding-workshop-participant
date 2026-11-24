import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import PercentBar from '../../components/PercentBar'
import { allocationColor } from './resourceUtils'

/** Red "Over-allocated" badge: visible text and an icon, not colour alone. */
export function OverAllocatedChip() {
  return <Chip size="small" color="error" icon={<WarningAmberIcon />} label="Over-allocated" />
}

/** A person's total allocation across active projects: red bar plus a badge once it is over 100%. */
export function AllocationTotal({ percent, overAllocated = false }) {
  return (
    <Box>
      <PercentBar value={percent} color={allocationColor(overAllocated)} />
      {overAllocated && (
        <Box sx={{ mt: 0.5 }}>
          <OverAllocatedChip />
        </Box>
      )}
    </Box>
  )
}

/** Name with the job title underneath (list title column and mobile card title). */
export function ResourceName({ resource }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box component="span" sx={{ display: 'block', fontWeight: 600, wordBreak: 'break-word' }}>
        {resource.full_name}
      </Box>
      <Typography component="span" variant="body2" color="textSecondary" sx={{ display: 'block' }}>
        {resource.job_title}
      </Typography>
    </Box>
  )
}

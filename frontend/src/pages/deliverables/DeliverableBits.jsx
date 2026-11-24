import StarIcon from '@mui/icons-material/Star'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import { formatDate } from '../../utils/format'

/** Badge for key deliverables: visible text (not colour alone), full meaning in the title. */
export function KeyBadge({ label = 'Key' }) {
  return <Chip size="small" color="secondary" variant="outlined" icon={<StarIcon />} label={label} title="Key deliverable" />
}

/** Due date; an overdue one is shown in the error colour with an "Overdue" label. */
export function DueDate({ date, overdue = false }) {
  if (!overdue) return <span>{formatDate(date)}</span>
  return (
    <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>
      {formatDate(date)} (Overdue)
    </Box>
  )
}

/** Deliverable name followed by the key badge when it is a key deliverable. */
export function DeliverableName({ deliverable }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <span>{deliverable.name}</span>
      {deliverable.is_key && <KeyBadge />}
    </Box>
  )
}

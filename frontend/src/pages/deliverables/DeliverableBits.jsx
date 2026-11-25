import StarIcon from '@mui/icons-material/Star'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'

/** Badge for key deliverables: visible text (not colour alone), full meaning in the title. */
export function KeyBadge({ label = 'Key' }) {
  return <Chip size="small" color="secondary" variant="outlined" icon={<StarIcon />} label={label} title="Key deliverable" />
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

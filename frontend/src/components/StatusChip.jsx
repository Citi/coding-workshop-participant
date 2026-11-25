import Chip from '@mui/material/Chip'
import { findOption } from '../utils/labels'

/** Coloured label for an enum value. kind: project | deliverable | health | category | role */
export default function StatusChip({ kind, value, size = 'small', variant }) {
  const option = findOption(kind, value)
  if (!option) return <Chip size={size} label={value ? String(value) : '—'} variant="outlined" />
  return <Chip size={size} label={option.label} color={option.color} variant={variant || (option.color === 'default' ? 'outlined' : 'filled')} />
}

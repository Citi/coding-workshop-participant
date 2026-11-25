import { Fragment } from 'react'
import BlockIcon from '@mui/icons-material/Block'
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { UrgencyLabel } from '../../components/DueDate'
import StatusChip from '../../components/StatusChip'
import { formatDate, relativeDue } from '../../utils/format'
import { isBlocker } from './deliverableUtils'

const MAX_INDENT_LEVELS = 4

/**
 * The name and its line start at 160px beside the indent arrow and grow from there; in a narrow
 * dialog the chips wrap under them, instead of the text dropping below the arrow and leaving the
 * arrow alone on a line.
 */
const textStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 160 }

/**
 * 'Zeus ERP · Due Jan 10, 2026 · 3 days overdue · Level 2': one line that wraps in a narrow dialog,
 * with the app-wide urgency label in its tone's colour (none once the deliverable is completed).
 * The line already says "Due", so the label goes without it: 'Due Dec 9, 2026 · in 2 weeks'.
 */
function Summary({ item, showDepth }) {
  const urgency = relativeDue(item.due_date, { done: item.status === 'completed', verb: false })
  const parts = [
    item.project_name,
    `Due ${formatDate(item.due_date)}`,
    urgency && <UrgencyLabel urgency={urgency} variant="inherit" />,
    showDepth && (item.depth === 1 ? 'Level 1 (direct)' : `Level ${item.depth}`),
  ]
  return parts.filter(Boolean).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && ' · '}
      {part}
    </Fragment>
  ))
}

function rowStyle(blocker) {
  return {
    borderLeft: 4,
    borderColor: blocker ? 'warning.main' : 'transparent',
    borderRadius: 1,
    bgcolor: blocker ? (theme) => alpha(theme.palette.warning.main, 0.08) : undefined,
    flexWrap: 'wrap',
    gap: 1,
  }
}

/**
 * Related deliverables (prerequisites, dependency chain or dependents). Clicking one opens it.
 * showDepth: indent by `depth` (chain view); highlightBlockers: mark prerequisites not completed yet.
 */
export default function DependencyList({ items, label, emptyText, onOpen, showDepth = false, highlightBlockers = false }) {
  if (!items.length) return emptyText ? <Typography color="textSecondary">{emptyText}</Typography> : null
  return (
    <List dense disablePadding aria-label={label}>
      {items.map((item) => {
        const blocker = highlightBlockers && isBlocker(item)
        const indent = showDepth ? Math.min(item.depth - 1, MAX_INDENT_LEVELS) * 3 : 0
        return (
          <ListItem key={item.id} disablePadding data-depth={showDepth ? item.depth : undefined} sx={{ pl: indent, mb: 0.5 }}>
            <ListItemButton onClick={() => onOpen(item)} sx={rowStyle(blocker)}>
              {showDepth && item.depth > 1 && (
                <SubdirectoryArrowRightIcon fontSize="small" color="action" sx={{ mr: 0.5 }} />
              )}
              <ListItemText primary={item.name} secondary={<Summary item={item} showDepth={showDepth} />} sx={textStyle} />
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                {blocker && (
                  // Opaque background: amber text on the tinted row would fall below 4.5:1 contrast.
                  <Chip size="small" color="warning" variant="outlined" icon={<BlockIcon />} label="Blocker" sx={{ bgcolor: 'background.paper' }} />
                )}
                <StatusChip kind="deliverable" value={item.status} />
              </Stack>
            </ListItemButton>
          </ListItem>
        )
      })}
    </List>
  )
}

import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Box from '@mui/material/Box'
import CardActionArea from '@mui/material/CardActionArea'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'

/**
 * A linked tile shows it can be opened: a chevron (always), a primary border and a lift on hover
 * (only where there is hover, not on touch screens).
 */
const linkedTileSx = {
  height: '100%',
  transition: (theme) => theme.transitions.create(['border-color', 'box-shadow'], { duration: theme.transitions.duration.shorter }),
  '@media (hover: hover)': { '&:hover': { borderColor: 'primary.main', boxShadow: 2 } },
}

/** The link fills the whole tile; MUI's ButtonBase removes the browser outline, so draw a focus ring. */
const tileLinkSx = {
  p: 2,
  height: '100%',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
}

/**
 * The linked tile's accessible name: its visible text in reading order, punctuated so screen
 * readers pause between the parts, e.g. "Projects at risk: 2, 1 at risk · 1 overdue". Every word
 * shown in the link is part of its name (WCAG 2.5.3 Label in Name, axe "label-content-name-mismatch"),
 * and it starts with the label, so "click Projects at risk" works for speech input.
 */
function linkName(label, value, helper) {
  return [`${label}: ${value}`, helper].filter((part) => part !== undefined && part !== null && part !== '').join(', ')
}

/**
 * The always-visible cue that a linked tile opens something (touch screens have no hover): a
 * chevron in the bottom-right corner of the content, so it lines up across a row of tiles whatever
 * their text. Decorative (MUI icons are aria-hidden): screen readers already hear a link.
 */
const linkCueSx = { position: 'absolute', right: 16, bottom: 16 }

/** The tile's last line keeps clear of the chevron: its text wraps before reaching it. */
const CLEAR_OF_LINK_CUE = { pr: 3 }

/**
 * KPI tile: label, big value and an optional helper line.
 * With `to` (a router path such as '/projects?status=active') the whole tile is one link to the
 * list behind the figure, named "<label>: <value>, <helper>" (see linkName), with a chevron in its
 * corner. Without `to` it is a plain, non-interactive tile.
 */
export default function StatCard({ label, value, helper, color = 'text.primary', icon, to }) {
  const clearOfLinkCue = (lastLine) => (to && lastLine ? CLEAR_OF_LINK_CUE : null)
  // The spaces between the blocks do not show, but keep their words apart in the tile's text:
  // "Projects at risk 2 1 at risk", not "Projects at risk21 at risk" (as text-based checks such as
  // axe's Label in Name rule, and name-from-content, read it).
  const content = (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Typography variant="body2" color="textSecondary">{label}</Typography>
        {icon}
      </Box>{' '}
      <Typography variant="h4" component="p" sx={[{ color, fontWeight: 700, my: 0.5 }, clearOfLinkCue(!helper)]}>
        {value}
      </Typography>
      {helper && (
        <>
          {' '}
          <Typography variant="body2" color="textSecondary" sx={clearOfLinkCue(true)}>
            {helper}
          </Typography>
        </>
      )}
    </>
  )

  if (!to) return <Paper sx={{ p: 2, height: '100%' }}>{content}</Paper>
  return (
    <Paper sx={linkedTileSx}>
      <CardActionArea component={RouterLink} to={to} aria-label={linkName(label, value, helper)} sx={tileLinkSx}>
        {content}
        <ChevronRightIcon fontSize="small" color="action" sx={linkCueSx} />
      </CardActionArea>
    </Paper>
  )
}

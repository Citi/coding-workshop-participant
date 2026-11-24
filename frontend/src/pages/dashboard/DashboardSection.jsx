import { useId, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { EmptyState } from '../../components/StateViews'
import { useAuth } from '../../context/authContext'
import { VISIBLE_ROWS } from './dashboardUtils'

/**
 * A dashboard panel: a Paper section named by its h2 heading, a one-line description and an optional
 * "View all" link to the full list (shown only when the user's role may open that page).
 *   viewAll: { to, label (accessible name, starts with "View all"), permission }
 */
export default function DashboardSection({ title, description, viewAll, children }) {
  const headingId = useId()
  return (
    <Paper component="section" aria-labelledby={headingId} sx={{ p: 2, height: '100%' }}>
      {/* A long heading wraps on narrow panels while "View all" stays on the right. */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
        <Typography id={headingId} variant="h6" component="h2" sx={{ minWidth: 0 }}>
          {title}
        </Typography>
        {viewAll && <ViewAllLink {...viewAll} />}
      </Box>
      {description && (
        <Typography variant="body2" color="textSecondary">
          {description}
        </Typography>
      )}
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Paper>
  )
}

function ViewAllLink({ to, label, permission }) {
  const { can } = useAuth()
  if (permission && !can(permission)) return null
  return (
    <Link component={RouterLink} to={to} variant="body2" aria-label={label} sx={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
      View all
    </Link>
  )
}

/** A section's records, a few at a time ("Show N more" / "Show fewer"), or its empty state. */
export function SectionList({
  items,
  renderItem,
  label,
  emptyTitle,
  emptyMessage,
  limit = VISIBLE_ROWS,
  getKey = (item) => item.id,
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  if (!items?.length) return <EmptyState title={emptyTitle} message={emptyMessage} />

  const visible = expanded ? items : items.slice(0, limit)
  return (
    <>
      <List id={listId} aria-label={label} disablePadding>
        {visible.map((item, index) => (
          <ListItem key={getKey(item)} disableGutters divider={index < visible.length - 1} sx={{ display: 'block', py: 1.5 }}>
            {renderItem(item)}
          </ListItem>
        ))}
      </List>
      {items.length > limit && (
        <Button size="small" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show fewer' : `Show ${items.length - limit} more`}
        </Button>
      )}
    </>
  )
}

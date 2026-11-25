import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '../../context/authContext'

/** A record's name linking to its page, or plain text when the user's role may not open that page. */
export function RecordLink({ to, permission, strong = true, children }) {
  const { can } = useAuth()
  const sx = { fontWeight: strong ? 600 : undefined, wordBreak: 'break-word' }
  if (permission && !can(permission)) {
    return (
      <Box component="span" sx={sx}>
        {children}
      </Box>
    )
  }
  return (
    <Link component={RouterLink} to={to} sx={sx}>
      {children}
    </Link>
  )
}

/** First lines of a list item: the name with an optional detail line, and a chip or figure on the right. */
export function ItemHeader({ title, subtitle, aside }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="div" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography component="div" variant="body2" color="textSecondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      {aside && <Box sx={{ flexShrink: 0 }}>{aside}</Box>}
    </Box>
  )
}

/** Label/value pairs (a description list) that wrap into as many columns as the panel is wide. */
export function Facts({ children }) {
  return (
    <Box
      component="dl"
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, m: 0, mt: 1 }}
    >
      {children}
    </Box>
  )
}

export function Fact({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="textSecondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0 }}>
        {children}
      </Typography>
    </Box>
  )
}

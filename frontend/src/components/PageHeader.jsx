import { useEffect } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Box from '@mui/material/Box'
import Button, { buttonClasses } from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { APP_NAME } from '../config'

/**
 * Beside the title (from 600px) the actions keep their natural width, so a long title or subtitle
 * wraps instead of squeezing a button label onto two lines ("New" over "resource"). On phones they
 * sit below the title and wrap button by button, each label on one line.
 */
const actionsStyle = {
  flexWrap: 'wrap',
  flexShrink: 0,
  [`& .${buttonClasses.root}`]: { whiteSpace: 'nowrap' },
}

/**
 * The page's name in the browser tab and history, e.g. "Projects · ACME Project Tracker", so
 * screen reader users hear which page opened (WCAG 2.4.2 Page Titled).
 */
function useDocumentTitle(title) {
  useEffect(() => {
    if (typeof title !== 'string' || !title) return undefined
    document.title = `${title} · ${APP_NAME}`
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}

/** Page title row: optional back link, title/subtitle, and action buttons (below the title on phones). */
export default function PageHeader({ title, subtitle, actions, backTo, backLabel = 'Back' }) {
  useDocumentTitle(title)
  return (
    <Box sx={{ mb: 3 }}>
      {backTo && (
        <Button component={RouterLink} to={backTo} startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 1 }}>
          {backLabel}
        </Button>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' } }}>
        {/* minWidth 0 lets the title column narrow, so its text wraps next to the actions. */}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, wordBreak: 'break-word' }}>
            {title}
          </Typography>
          {subtitle && <Typography color="textSecondary">{subtitle}</Typography>}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1} useFlexGap sx={actionsStyle}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

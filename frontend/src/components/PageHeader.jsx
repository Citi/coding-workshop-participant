import { useEffect } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { APP_NAME } from '../config'

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

/** Page title row: optional back link, title/subtitle, and action buttons (wrap on mobile). */
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
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, wordBreak: 'break-word' }}>
            {title}
          </Typography>
          {subtitle && <Typography color="textSecondary">{subtitle}</Typography>}
        </Box>
        {actions && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{actions}</Stack>}
      </Stack>
    </Box>
  )
}

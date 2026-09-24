import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'

import { brand } from '../theme'

/** The product name, used as the brand link's accessible name. */
export const APP_NAME = 'ACME Facilities Incident Desk'

/**
 * The "A" tile with "ACME Facilities / Incident Desk", linking to the start page.
 * Used at the top of the sidebar and in the tablet/phone top bar.
 */
function BrandMark() {
  return (
    <Box
      component={RouterLink}
      to="/"
      aria-label={APP_NAME}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'inherit', textDecoration: 'none', minWidth: 0 }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 32,
          height: 32,
          flex: 'none',
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
        }}
      >
        A
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
        <Typography component="span" noWrap sx={{ fontWeight: 700, color: brand.navy, fontSize: 15, lineHeight: 'inherit' }}>
          ACME Facilities
        </Typography>
        <Typography component="span" noWrap sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 'inherit' }}>
          Incident Desk
        </Typography>
      </Box>
    </Box>
  )
}

export default BrandMark

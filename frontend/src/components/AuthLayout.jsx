import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { Link as RouterLink, Outlet } from 'react-router'

import { brand } from '../theme'
import { APP_NAME } from './BrandMark'

/** Text tints on the navy panel; all pass AA contrast on navy. */
const panelInk = { subtle: '#B9D3EA', body: '#CFE2F3', footer: '#9FC0DD', arrow: '#7FB2DA' }

const FLOW = ['Open', 'In Progress', 'Resolved', 'Closed']

/** Open → In Progress → Resolved → Closed, with the last step highlighted. */
function StatusFlow() {
  return (
    <Box
      component="ol"
      aria-label="How a ticket moves"
      sx={{ listStyle: 'none', p: 0, m: 0, mt: { xs: 2.5, md: 5 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
    >
      {FLOW.map((step, index) => {
        const last = index === FLOW.length - 1
        return (
          <Box component="li" key={step} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              component="span"
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 4,
                fontSize: 13,
                fontWeight: last ? 700 : 600,
                bgcolor: last ? brand.white : 'rgba(255,255,255,.12)',
                color: last ? brand.navy : brand.white,
              }}
            >
              {step}
            </Box>
            {!last && <ArrowForwardIcon aria-hidden="true" sx={{ fontSize: 18, color: panelInk.arrow }} />}
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * Split screen for sign in and sign up. Desktop and landscape tablets: a navy brand panel
 * on the left and the form centered on the right. Portrait tablets and phones: a shorter
 * navy header above the form; phones drop the flow and footer to keep the form in view.
 */
function AuthLayout() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, bgcolor: 'background.default' }}>
      <Box
        component="header"
        sx={{
          width: { md: '40%', lg: 600 },
          flex: 'none',
          bgcolor: brand.navy,
          color: brand.white,
          display: 'flex',
          flexDirection: 'column',
          p: { xs: 2.5, sm: 4, lg: 7 },
          boxSizing: 'border-box',
        }}
      >
        <Box component={RouterLink} to="/" aria-label={APP_NAME} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none', alignSelf: 'flex-start' }}>
          <Box
            aria-hidden="true"
            sx={{ width: 40, height: 40, borderRadius: 1.25, bgcolor: brand.white, color: brand.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}
          >
            A
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <Box component="span" sx={{ fontWeight: 700, fontSize: 17 }}>ACME Facilities</Box>
            <Box component="span" sx={{ fontSize: 13, color: panelInk.subtle }}>Incident Desk</Box>
          </Box>
        </Box>

        <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
        <Typography
          component="p"
          sx={{
            mt: { xs: 2.5, sm: 4, md: 0 },
            fontSize: { xs: 24, sm: 32, md: 36, lg: 46 },
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            textWrap: 'pretty',
          }}
        >
          Report it once. Follow it until it&rsquo;s fixed.
        </Typography>
        <Typography
          sx={{ display: { xs: 'none', sm: 'block' }, mt: 2.25, fontSize: { sm: 16, lg: 18 }, lineHeight: 1.5, color: panelInk.body, maxWidth: 440 }}
        >
          Log problems with your desk, floor or building. You&apos;ll see every update from the engineer working on it.
        </Typography>
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <StatusFlow />
        </Box>
        <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
        <Typography sx={{ display: { xs: 'none', md: 'block' }, fontSize: 13, color: panelInk.footer }}>
          &copy; {new Date().getFullYear()} ACME Inc. · Internal use only
        </Typography>
      </Box>

      <Box
        component="main"
        sx={{ flex: 1, display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'center', p: { xs: 2, sm: 4 }, minWidth: 0 }}
      >
        <Outlet />
      </Box>
    </Box>
  )
}

export default AuthLayout

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import PropTypes from 'prop-types'
import { Link as RouterLink, useLocation } from 'react-router'

const PAGES = [
  { to: '/login', label: 'Sign in' },
  { to: '/register', label: 'Create account' },
]

/** "Sign in | Create account" switch. They are separate pages, so these are links. */
function AuthSwitch() {
  const { pathname } = useLocation()
  return (
    <Box component="nav" aria-label="Account" sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider' }}>
      {PAGES.map(({ to, label }) => {
        const current = pathname === to
        return (
          <Box
            key={to}
            component={RouterLink}
            to={to}
            aria-current={current ? 'page' : undefined}
            sx={{
              flex: 1,
              textAlign: 'center',
              pb: current ? 1.25 : 1.5,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
              color: current ? 'primary.main' : 'text.secondary',
              borderBottom: current ? 2 : 0,
              borderColor: 'primary.main',
              '&:hover': { color: 'primary.dark' },
            }}
          >
            {label}
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * The white card on the sign-in and sign-up pages: the page switch, a title and subtitle,
 * the form, and an optional note underneath. Fills the width on phones, 460px otherwise.
 */
function AuthCard({ title, subtitle, footnote, children }) {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 460,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.75,
        px: { xs: 2.5, sm: 5 },
        py: { xs: 3, sm: 4.5 },
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 2.75,
      }}
    >
      <AuthSwitch />
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: 24 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 14 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
      {footnote && (
        <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.5, textAlign: 'center', textWrap: 'pretty' }}>
          {footnote}
        </Typography>
      )}
    </Box>
  )
}

AuthCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  footnote: PropTypes.string,
  children: PropTypes.node.isRequired,
}

export default AuthCard

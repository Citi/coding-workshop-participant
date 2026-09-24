import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import ApartmentIcon from '@mui/icons-material/Apartment'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import GroupIcon from '@mui/icons-material/Group'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'
import PropTypes from 'prop-types'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'

import useAuth from '../auth/useAuth'
import { brand } from '../theme'
import { initialsFor } from '../utils/people'
import { navLinksFor, roleLabel } from '../utils/roles'
import BrandMark from './BrandMark'

/** Icon per NAV_LINKS `icon` key: [outlined, filled]. The filled one marks the current page. */
const NAV_ICONS = {
  dashboard: [SpaceDashboardOutlinedIcon, SpaceDashboardIcon],
  report: [AddCircleOutlineIcon, AddCircleIcon],
  people: [GroupOutlinedIcon, GroupIcon],
  facilities: [ApartmentOutlinedIcon, ApartmentIcon],
}

/** One sidebar link. The current page gets a tint, bold text, a filled icon and aria-current. */
function NavItem({ to, label, icon, current, onNavigate }) {
  const [Outlined, Filled] = NAV_ICONS[icon] ?? NAV_ICONS.dashboard
  const Icon = current ? Filled : Outlined
  return (
    <ListItemButton
      component={RouterLink}
      to={to}
      onClick={onNavigate}
      aria-current={current ? 'page' : undefined}
      sx={{
        minHeight: 40,
        px: 1.5,
        borderRadius: 1,
        mb: 0.25,
        color: current ? brand.navy : brand.inkSoft,
        bgcolor: current ? brand.selected : 'transparent',
        '&:hover': { bgcolor: current ? brand.selected : 'action.hover' },
      }}
    >
      <ListItemIcon sx={{ minWidth: 0, mr: 1.5, color: 'inherit' }}>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={label}
        slotProps={{ primary: { sx: { fontSize: 14, fontWeight: current ? 600 : 500 } } }}
      />
    </ListItemButton>
  )
}

NavItem.propTypes = {
  to: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  current: PropTypes.bool.isRequired,
  onNavigate: PropTypes.func,
}

/**
 * The signed-in user's card at the foot of the sidebar: initials, name, email and a
 * sign-out button. Long names and emails are cut with an ellipsis; the full text is in a
 * tooltip.
 */
function UserCard({ user, onSignOut }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.25,
      }}
    >
      <Avatar aria-hidden="true" sx={{ width: 34, height: 34, fontSize: 13, fontWeight: 700, bgcolor: brand.selected, color: brand.navy }}>
        {initialsFor(user.full_name)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
        <Typography noWrap title={user.full_name} sx={{ fontSize: 13, fontWeight: 600 }}>
          {user.full_name}
        </Typography>
        <Typography noWrap title={user.email} sx={{ fontSize: 12, color: 'text.secondary' }}>
          {user.email}
        </Typography>
      </Box>
      <Tooltip title="Sign out">
        <IconButton aria-label="Sign out" size="small" onClick={onSignOut} sx={{ color: 'text.secondary' }}>
          <LogoutIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

UserCard.propTypes = {
  user: PropTypes.shape({
    full_name: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
  }).isRequired,
  onSignOut: PropTypes.func.isRequired,
}

/**
 * Sidebar for signed-in users: brand, the role's page links under a role label, and the
 * user card with sign-out. The layout shows it docked on desktop and in a slide-out
 * drawer on tablets and phones, where `onNavigate` closes the drawer after a link click.
 */
function Sidebar({ onNavigate }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (!user) return null
  const links = navLinksFor(user.role, pathname)

  const handleSignOut = () => {
    onNavigate?.()
    signOut("You've signed out.")
    navigate('/login', { replace: true })
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', px: 1.5, pt: 2.25, pb: 1.75 }}>
      <Box sx={{ px: 1.25, pb: 2.25 }}>
        <BrandMark />
      </Box>
      <Box component="nav" aria-label="Main">
        <Typography
          component="p"
          sx={{ px: 1.5, pt: 0.75, pb: 1, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}
        >
          {roleLabel(user.role)}
        </Typography>
        <List disablePadding>
          {links.map((link) => (
            <NavItem key={link.to} {...link} onNavigate={onNavigate} />
          ))}
        </List>
      </Box>
      <Box sx={{ flex: 1 }} />
      <UserCard user={user} onSignOut={handleSignOut} />
    </Box>
  )
}

Sidebar.propTypes = {
  onNavigate: PropTypes.func,
}

export default Sidebar

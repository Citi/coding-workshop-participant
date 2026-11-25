import { startTransition, useState } from 'react'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { APP_NAME } from '../config'
import { useAuth } from '../context/authContext'
import { useNotify } from '../context/notificationContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { NAV_ITEMS } from './navItems'
import StatusChip from './StatusChip'

const DRAWER_WIDTH = 240


/** App shell: top bar + side navigation (permanent on desktop, slide-out drawer on mobile). */
export default function AppLayout() {
  const { user, can, logout } = useAuth()
  const notify = useNotify()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    // React Router runs navigations as transitions; ending the session in the same transition
    // means protected pages never re-render without a session (which would remember this page
    // as the "return to" target for whoever logs in next).
    startTransition(() => {
      logout()
      navigate('/login', { replace: true })
    })
    notify.info('You have been logged out')
  }

  const navigation = (
    <Box component="nav" aria-label="Main navigation">
      <Toolbar />
      <Divider />
      <List>
        {NAV_ITEMS.filter((item) => can(item.permission)).map((item) => (
          // <li> wrapper keeps the <ul> valid for screen readers (axe "list" rule)
          <ListItem key={item.to} disablePadding>
            <ListItemButton
              component={NavLink}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              sx={{
                mx: 1,
                borderRadius: 2,
                '&.active': { bgcolor: 'action.selected', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Link
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
        sx={{ position: 'absolute', left: -9999, '&:focus': { left: 16, top: 16, zIndex: 2000, bgcolor: 'background.paper', p: 1 } }}
      >
        Skip to main content
      </Link>
      <AppBar position="fixed" color="inherit" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          {isMobile && (
            <IconButton edge="start" aria-label="Open navigation menu" onClick={() => setMenuOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="div" noWrap sx={{ flexGrow: 1, color: 'primary.main' }}>
            {APP_NAME}
          </Typography>
          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {!isMobile && (
                <Typography variant="body2" color="textSecondary">
                  {user.full_name}
                </Typography>
              )}
              <StatusChip kind="role" value={user.role} />
              <Tooltip title="Log out">
                <IconButton aria-label="Log out" onClick={handleLogout}>
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <Drawer variant="temporary" open={menuOpen} onClose={() => setMenuOpen(false)} slotProps={{ paper: { sx: { width: DRAWER_WIDTH } } }}>
          {navigation}
        </Drawer>
      ) : (
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0 }} slotProps={{ paper: { sx: { width: DRAWER_WIDTH, boxSizing: 'border-box' } } }}>
          {navigation}
        </Drawer>
      )}

      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 }, outline: 'none', width: { md: `calc(100% - ${DRAWER_WIDTH}px)` } }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  )
}

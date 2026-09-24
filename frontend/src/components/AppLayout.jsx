import { useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Drawer from '@mui/material/Drawer'
import { Outlet } from 'react-router'

import useAuth from '../auth/useAuth'
import useIsDesktop from '../hooks/useIsDesktop'
import { SIDEBAR_WIDTH } from '../theme'
import AppHeader from './AppHeader'
import Sidebar from './Sidebar'

const sidebarPaper = {
  '& .MuiDrawer-paper': {
    width: SIDEBAR_WIDTH,
    maxWidth: '85vw',
    boxSizing: 'border-box',
    borderRight: 1,
    borderColor: 'divider',
  },
}

/**
 * Page frame. Signed-in users on desktop get the sidebar docked on the left; on tablets
 * and phones a top bar opens the same sidebar as a drawer. Guests get only the top bar.
 * The page itself fills the remaining width up to a readable maximum.
 */
function AppLayout() {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const [menuOpen, setMenuOpen] = useState(false)
  const docked = Boolean(user) && isDesktop
  const closeMenu = () => setMenuOpen(false)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {docked && (
        <Drawer id="app-sidebar" variant="permanent" sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, ...sidebarPaper }}>
          <Sidebar />
        </Drawer>
      )}
      {user && !isDesktop && (
        <Drawer id="app-sidebar" variant="temporary" open={menuOpen} onClose={closeMenu} sx={sidebarPaper}>
          <Sidebar onNavigate={closeMenu} />
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!docked && <AppHeader onOpenMenu={user ? () => setMenuOpen(true) : undefined} menuOpen={menuOpen} />}
        <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 3, lg: 4 }, px: { xs: 2, sm: 3, lg: 4 } }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}

export default AppLayout

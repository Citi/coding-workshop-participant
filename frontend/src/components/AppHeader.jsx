import AppBar from '@mui/material/AppBar'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import MenuIcon from '@mui/icons-material/Menu'
import PropTypes from 'prop-types'

import BrandMark from './BrandMark'

/**
 * Top bar for tablets and phones, and for guests at any width. Signed-in users get a
 * menu button that opens the sidebar drawer; on desktop the docked sidebar replaces this
 * bar entirely.
 */
function AppHeader({ onOpenMenu, menuOpen = false }) {
  return (
    <AppBar position="sticky" color="inherit" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 1 }}>
        {onOpenMenu && (
          <IconButton
            edge="start"
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={menuOpen}
            onClick={onOpenMenu}
          >
            <MenuIcon />
          </IconButton>
        )}
        <BrandMark />
      </Toolbar>
    </AppBar>
  )
}

AppHeader.propTypes = {
  onOpenMenu: PropTypes.func,
  menuOpen: PropTypes.bool,
}

export default AppHeader

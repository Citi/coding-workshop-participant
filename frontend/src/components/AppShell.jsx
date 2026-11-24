import { Suspense, useId, useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ErrorBoundary from './ErrorBoundary.jsx';
import LoadingState from './LoadingState.jsx';
import { useAuth } from '../auth/useAuth.js';
import { AUDIT_PAGE_ROLES, USERS_PAGE_ROLES } from '../auth/permissions.js';
import { APP_NAME, ROLE_LABELS } from '../constants.js';
import useIsMobile from '../hooks/useIsMobile.js';

const DRAWER_WIDTH = 248;

/** Navigation entries; `roles` hides an entry from everyone else (spec 7 and 12.3). */
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: <DashboardOutlinedIcon />, exact: true },
  { to: '/projects', label: 'Projects', icon: <FolderOutlinedIcon /> },
  { to: '/deliverables', label: 'Deliverables', icon: <AssignmentOutlinedIcon /> },
  { to: '/capacity', label: 'Capacity', icon: <GroupsOutlinedIcon /> },
  { to: '/budget', label: 'Budget', icon: <AccountBalanceWalletOutlinedIcon /> },
  { to: '/risk', label: 'Risk', icon: <ReportProblemOutlinedIcon /> },
  { to: '/audit', label: 'Audit log', icon: <HistoryOutlinedIcon />, roles: AUDIT_PAGE_ROLES },
  { to: '/users', label: 'Users', icon: <ManageAccountsOutlinedIcon />, roles: USERS_PAGE_ROLES },
];

function isSelected(item, pathname) {
  if (item.exact) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * Application frame for signed-in pages: app bar with the user menu, a navigation drawer
 * (permanent on desktop, temporary on mobile) filtered by role, and the routed page.
 * @returns {JSX.Element} The shell with the current page inside.
 */
export default function AppShell() {
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();
  const location = useLocation();
  const menuId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const role = user?.role;
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  const closeMobileDrawer = () => setMobileOpen(false);
  const handleLogout = () => {
    setMenuAnchor(null);
    logout();
  };

  const drawerContent = (
    <Box component="nav" aria-label="Main navigation">
      <Toolbar sx={{ gap: 1 }}>
        <InsightsIcon color="primary" aria-hidden="true" />
        <Typography variant="subtitle1" component="span" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {APP_NAME}
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {items.map((item) => {
          const selected = isSelected(item, location.pathname);
          return (
            <ListItemButton
              key={item.to}
              component={RouterLink}
              to={item.to}
              selected={selected}
              aria-current={selected ? 'page' : undefined}
              onClick={isMobile ? closeMobileDrawer : undefined}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: 8,
          top: -48,
          zIndex: (theme) => theme.zIndex.tooltip,
          bgcolor: 'background.paper',
          color: 'primary.main',
          px: 2,
          py: 1,
          borderRadius: 1,
          boxShadow: 2,
          '&:focus': { top: 8 },
        }}
      >
        Skip to main content
      </Box>
      <AppBar
        position="fixed"
        sx={{
          // Desktop: the bar sits above the permanent drawer. Mobile: the modal drawer covers it.
          zIndex: (theme) => (isMobile ? theme.zIndex.appBar : theme.zIndex.drawer + 1),
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {isMobile ? (
            <IconButton
              color="inherit"
              edge="start"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography variant="h6" component="p" noWrap sx={{ flexGrow: 1, fontWeight: 700 }}>
            {isMobile ? 'ACME' : APP_NAME}
          </Typography>
          {user ? (
            <>
              {!isMobile ? (
                <Box sx={{ textAlign: 'right', mr: 1, minWidth: 0 }}>
                  <Typography variant="body2" component="p" noWrap sx={{ fontWeight: 600 }}>
                    {user.name}
                  </Typography>
                  <Typography variant="caption" component="p" noWrap sx={{ opacity: 0.85 }}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Typography>
                </Box>
              ) : null}
              <IconButton
                color="inherit"
                aria-label="Account menu"
                aria-controls={menuAnchor ? menuId : undefined}
                aria-haspopup="true"
                aria-expanded={menuAnchor ? 'true' : undefined}
                onClick={(event) => setMenuAnchor(event.currentTarget)}
              >
                <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', fontSize: '0.9rem' }}>
                  {initials(user.name)}
                </Avatar>
              </IconButton>
              <Menu
                id={menuId}
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <Box sx={{ px: 2, py: 1, maxWidth: 280 }}>
                  <Typography variant="subtitle2" component="p" noWrap>
                    {user.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {user.email}
                  </Typography>
                  <Chip size="small" label={ROLE_LABELS[user.role] ?? user.role} sx={{ mt: 1 }} />
                </Box>
                <Divider />
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Log out
                </MenuItem>
              </Menu>
            </>
          ) : null}
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={closeMobileDrawer}
          ModalProps={{ keepMounted: true }}
          slotProps={{ paper: { sx: { width: DRAWER_WIDTH } } }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{ width: DRAWER_WIDTH, flexShrink: 0 }}
          slotProps={{ paper: { sx: { width: DRAWER_WIDTH, boxSizing: 'border-box' } } }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, md: 3 }, pb: 4, outline: 'none' }}
      >
        <Toolbar sx={{ mb: { xs: 2, md: 3 } }} />
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<LoadingState message="Loading page…" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Box>
    </Box>
  );
}

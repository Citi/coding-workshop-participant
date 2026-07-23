import { useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import GroupIcon from '@mui/icons-material/Group';
import InsightsIcon from '@mui/icons-material/Insights';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import MenuIcon from '@mui/icons-material/Menu';
import PaymentsIcon from '@mui/icons-material/Payments';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import { AnimatePresence, motion } from 'framer-motion';
import useAuth from '../../hooks/useAuth';
import { ACTIONS, ROLE_LABELS } from '../../utils/constants';
import { DRAWER_WIDTH } from '../../styles/theme';
import { initials } from '../../utils/formatters';
import { pageVariants } from '../../utils/motion';

// A faint two-tone glow on the app canvas. Every surface is frosted glass, so
// this gradient is what gives the blur something to refract -- without it the
// glass reads as flat white.
const CANVAS_BACKGROUND =
  'radial-gradient(1100px 600px at 100% -8%, rgba(99, 102, 241, 0.10), transparent 60%), ' +
  'radial-gradient(900px 520px at -10% 110%, rgba(13, 148, 136, 0.08), transparent 55%), ' +
  '#f6f7fb';

/**
 * The application shell: top bar, navigation drawer and the routed page.
 *
 * The drawer is permanent from 900px up and a temporary overlay below, so the
 * same navigation works on a phone without a second component.
 *
 * Entries the user's role cannot reach are filtered out rather than disabled:
 * a nav item leading only to a "forbidden" page is noise. That is why Budget
 * disappears for an Employee and Users for everyone but an Admin.
 */

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: <DashboardIcon />, action: ACTIONS.VIEW_DASHBOARD },
  { label: 'Projects', to: '/projects', icon: <FolderIcon />, action: ACTIONS.VIEW_PROJECTS },
  {
    label: 'Deliverables',
    to: '/deliverables',
    icon: <AssignmentIcon />,
    action: ACTIONS.VIEW_PROJECTS,
  },
  { label: 'Resources', to: '/resources', icon: <GroupIcon />, action: ACTIONS.VIEW_ALLOCATION },
  { label: 'Budget', to: '/budget', icon: <PaymentsIcon />, action: ACTIONS.VIEW_BUDGETS },
  { label: 'Reports', to: '/reports', icon: <InsightsIcon />, action: ACTIONS.GENERATE_REPORTS },
  { label: 'Users', to: '/users', icon: <ManageAccountsIcon />, action: ACTIONS.MANAGE_USERS },
];

export default function Layout() {
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);

  const { user, role, can, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter((item) => Boolean(can(item.action)));

  const handleLogout = async () => {
    setUserMenuAnchor(null);
    await logout();
    navigate('/login', { replace: true });
  };

  /** Exact match for the dashboard, prefix elsewhere so /projects/42 still
   *  highlights Projects. */
  const isActive = (to) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const drawerContent = (
    <>
      <Toolbar sx={{ gap: 1.5, px: 2.5 }}>
        <Box
          aria-hidden="true"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 2,
            color: 'common.white',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
          }}
        >
          <AccountTreeIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h3" component="div" noWrap sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            ACME PMO
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Project Portfolio
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <Typography
        variant="subtitle2"
        component="p"
        sx={{ px: 3, pt: 2.5, pb: 1, color: 'text.disabled' }}
      >
        Navigation
      </Typography>
      <List component="nav" aria-label="Main navigation" sx={{ px: 1.5 }}>
        {visibleItems.map((item) => (
          <ListItemButton
            key={item.to}
            component={RouterLink}
            to={item.to}
            selected={isActive(item.to)}
            onClick={() => setMobileOpen(false)}
            aria-current={isActive(item.to) ? 'page' : undefined}
            sx={{ mb: 0.5, py: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.9rem' }} />
          </ListItemButton>
        ))}
      </List>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          // Sit beside the permanent drawer rather than under it.
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h4" component="h1" noWrap sx={{ flexGrow: 1 }}>
            Project Management &amp; Tracking
          </Typography>

          {user && (
            <>
              <Chip
                label={ROLE_LABELS[role] ?? role}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ mr: 1, display: { xs: 'none', sm: 'inline-flex' } }}
              />
              <IconButton
                onClick={(event) => setUserMenuAnchor(event.currentTarget)}
                aria-label={`Account menu for ${user.fullName || user.email}`}
                aria-haspopup="menu"
                size="small"
              >
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                  {initials(user.fullName || user.email)}
                </Avatar>
              </IconButton>

              <Menu
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={() => setUserMenuAnchor(null)}
              >
                <MenuItem disabled sx={{ opacity: '1 !important' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {user.fullName || user.email}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {user.email}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {ROLE_LABELS[role] ?? role}
                    </Typography>
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Sign out
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          // Temporary below md, permanent above. `keepMounted` leaves the
          // mobile drawer in the DOM so opening it does not re-mount the nav.
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          p: { xs: 2, md: 3 },
          background: CANVAS_BACKGROUND,
        }}
      >
        {/* Spacer matching the fixed AppBar so content starts below it. */}
        <Toolbar />
        {/* Fade + lift each page in on navigation. `mode="wait"` lets the old
            page finish leaving before the new one enters, so they never overlap.
            Keyed on pathname so only a real route change triggers it. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </Box>
    </Box>
  );
}

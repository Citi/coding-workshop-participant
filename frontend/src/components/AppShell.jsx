import { useState } from 'react';
import PropTypes from 'prop-types';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import {
  AppBar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Toolbar, Typography,
} from '@mui/material';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import MenuIcon from '@mui/icons-material/Menu';
import { useAuth } from '../services/AuthContext';
import { useNotify } from '../services/NotifyContext';
import { tokens } from '../theme';
import { ROLE_LABEL } from '../utils/format';
import ChangePasswordDialog from './forms/ChangePasswordDialog';

const DRAWER_WIDTH = 248;

/** The tracker's mark: three time-card bars. */
function BrandMark() {
  return (
    <Box aria-hidden sx={{ display: 'grid', gap: '3px', width: 22 }}>
      <Box sx={{ height: 5, width: '100%', bgcolor: tokens.marigold, borderRadius: '1px' }} />
      <Box sx={{ height: 5, width: '70%', bgcolor: tokens.paper, borderRadius: '1px' }} />
      <Box sx={{ height: 5, width: '45%', bgcolor: '#9CC3A8', borderRadius: '1px' }} />
    </Box>
  );
}

function navItems(role) {
  const items = [
    { to: '/', label: 'Overview', icon: <DashboardOutlined /> },
    { to: '/projects', label: role === 'employee' ? 'My projects' : 'Projects', icon: <FolderOutlined /> },
    { to: '/time', label: role === 'employee' ? 'My time' : 'Time log', icon: <ScheduleOutlined /> },
  ];
  if (role !== 'employee') items.push({ to: '/people', label: role === 'manager' ? 'People' : 'People & teams', icon: <PeopleOutline /> });
  if (role === 'admin') items.push({ to: '/archive', label: 'Archive', icon: <Inventory2Outlined /> });
  return items;
}

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const notify = useNotify();
  const [anchor, setAnchor] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <Box sx={{
      height: '100%', display: 'flex', flexDirection: 'column', bgcolor: tokens.ink, color: '#E7EFEE',
    }}
    >
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 2.5,
      }}
      >
        <BrandMark />
        <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>Project Tracker</Typography>
      </Box>
      <List component="nav" aria-label="Main" sx={{ px: 1.5, flex: 1 }}>
        {navItems(user.role).map((item) => {
          const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
          return (
            <ListItemButton
              key={item.to}
              component={NavLink}
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              sx={{
                borderRadius: 1.5,
                mb: 0.5,
                color: active ? '#fff' : '#C5D6D4',
                bgcolor: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                boxShadow: active ? `inset 3px 0 0 ${tokens.marigold}` : 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 38 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} slotProps={{ primary: { fontWeight: 700 } }} />
            </ListItemButton>
          );
        })}
      </List>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        sx={{
          justifyContent: 'flex-start', textAlign: 'left', color: 'inherit', px: 2.5, py: 2, borderRadius: 0,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: '#fff' }} noWrap>{user.name}</Typography>
          <Typography variant="body2" sx={{ color: '#A9C0BD' }} noWrap>
            {ROLE_LABEL[user.role]}
            {user.job_title ? `, ${user.job_title}` : ''}
          </Typography>
        </Box>
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setAnchor(null); setPwOpen(true); }}>Change password</MenuItem>
        <MenuItem onClick={logout}>Sign out</MenuItem>
      </Menu>
      <ChangePasswordDialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onSaved={() => { setPwOpen(false); notify('Password changed.'); }}
      />
    </Box>
  );
}

SidebarContent.propTypes = { onNavigate: PropTypes.func };

/** Responsive layout: fixed sidebar on desktop, app bar + drawer on small screens. */
export default function AppShell() {
  const isDesktop = useMediaQuery({ minWidth: 960 });
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <a href="#main" className="skip-link" style={{ position: 'absolute', left: -9999 }} onFocus={(e) => { e.target.style.left = '8px'; }} onBlur={(e) => { e.target.style.left = '-9999px'; }}>
        Skip to content
      </a>
      {isDesktop ? (
        <Box component="aside" sx={{ width: DRAWER_WIDTH, flexShrink: 0 }}>
          <Box sx={{
            position: 'fixed', top: 0, bottom: 0, width: DRAWER_WIDTH,
          }}
          >
            <SidebarContent />
          </Box>
        </Box>
      ) : (
        <>
          <AppBar position="fixed" elevation={0} sx={{ bgcolor: tokens.ink }}>
            <Toolbar>
              <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} aria-label="Open navigation">
                <MenuIcon />
              </IconButton>
              <Box sx={{ ml: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <BrandMark />
                <Typography sx={{ fontWeight: 700 }}>Project Tracker</Typography>
              </Box>
            </Toolbar>
          </AppBar>
          <Drawer open={open} onClose={() => setOpen(false)} slotProps={{ paper: { sx: { width: DRAWER_WIDTH, border: 0 } } }}>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </Drawer>
        </>
      )}
      <Box
        component="main"
        id="main"
        tabIndex={-1}
        sx={{
          flex: 1, minWidth: 0, px: { xs: 2, sm: 3, md: 5 }, pt: { xs: 10, md: 5 }, pb: 6, outline: 'none',
        }}
      >
        <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

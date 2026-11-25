// Main navigation entries; each is shown only when the user's role has the permission.
import { createElement } from 'react'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import DashboardIcon from '@mui/icons-material/Dashboard'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import GroupsIcon from '@mui/icons-material/Groups'
import PaymentsIcon from '@mui/icons-material/Payments'

const icon = (Icon) => createElement(Icon)

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: icon(DashboardIcon), permission: 'dashboard:read', end: true },
  { to: '/projects', label: 'Projects', icon: icon(FolderOpenIcon), permission: 'projects:read' },
  { to: '/deliverables', label: 'Deliverables', icon: icon(AssignmentTurnedInIcon), permission: 'deliverables:read' },
  { to: '/resources', label: 'Resources', icon: icon(GroupsIcon), permission: 'resources:read' },
  { to: '/budget', label: 'Budget', icon: icon(PaymentsIcon), permission: 'expenses:read' },
  { to: '/users', label: 'Users', icon: icon(AdminPanelSettingsIcon), permission: 'users:read' },
]

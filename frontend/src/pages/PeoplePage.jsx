import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, InputAdornment, Link, List, ListItem,
  ListItemText, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import SearchIcon from '@mui/icons-material/Search';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { api } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useNotify } from '../services/NotifyContext';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusChip from '../components/StatusChip';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import UserFormDialog from '../components/forms/UserFormDialog';
import {
  formatDays, formatHours, ROLE_LABEL, SHOW_EMPTY_OPTION,
} from '../utils/format';

/** Read-only profile: who someone reports to, their projects and hours. */
function PersonDialog({ userId, onClose }) {
  const { data, loading, error } = useApi(() => api.get(`/users/${userId}`), [userId]);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        {data?.name || 'Person'}
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {loading && <Loading />}
        {error && <ErrorState error={error} />}
        {data && (
          <Stack spacing={2}>
            <Typography color="text.secondary">
              {[data.job_title, ROLE_LABEL[data.role], data.email].filter(Boolean).join(', ')}
            </Typography>
            {data.role === 'employee' && (
              <Typography>{data.manager_name ? `Reports to ${data.manager_name}` : 'Not assigned to a manager yet'}</Typography>
            )}
            <Typography>{`${formatHours(data.total_hours)} logged in total (${formatDays(data.total_hours)})`}</Typography>
            <Box>
              <Typography variant="h4" component="h3" gutterBottom>Projects</Typography>
              {data.projects.length === 0 ? (
                <Typography color="text.secondary">Not on any active projects.</Typography>
              ) : (
                <List dense disablePadding>
                  {data.projects.map((p) => (
                    <ListItem key={p.id} disableGutters secondaryAction={<StatusChip status={p.status} />}>
                      <ListItemText
                        primary={<Link component={RouterLink} to={`/projects/${p.id}`} onClick={onClose}>{p.name}</Link>}
                        secondary={`${formatHours(p.hours)} logged`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

PersonDialog.propTypes = { userId: PropTypes.number.isRequired, onClose: PropTypes.func.isRequired };

/**
 * People directory. Admins manage everyone (roles, teams, archive);
 * managers see employees and can edit the name/email of their own team.
 */
export default function PeoplePage() {
  const { user, isAdmin } = useAuth();
  const notify = useNotify();
  const isWide = useMediaQuery({ minWidth: 900 });
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [scope, setScope] = useState(isAdmin ? 'all' : 'team');
  const [editing, setEditing] = useState(null); // user object or 'new'
  const [viewing, setViewing] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const query = useDebounce(search);

  const {
    data, loading, error, reload,
  } = useApi(() => api.get('/users', {
    search: query,
    role: isAdmin ? role : 'employee',
    manager_id: scope === 'team' ? user.id : undefined,
  }), [query, role, scope]);
  const { data: managers } = useApi(() => (isAdmin ? api.get('/users', { role: 'manager' }) : Promise.resolve([])), [isAdmin]);

  const canEdit = (u) => isAdmin || (u.role === 'employee' && u.manager_id === user.id);
  const people = data || [];

  const rowActions = (u) => (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      {canEdit(u) && (
        <Tooltip title="Edit">
          <IconButton size="small" aria-label={`Edit ${u.name}`} onClick={(e) => { e.stopPropagation(); setEditing(u); }}>
            <EditOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isAdmin && u.id !== user.id && (
        <Tooltip title="Move to archive">
          <IconButton size="small" aria-label={`Archive ${u.name}`} onClick={(e) => { e.stopPropagation(); setArchiving(u); }}>
            <Inventory2Outlined fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );

  return (
    <>
      <PageHeader
        title={isAdmin ? 'People & teams' : 'People'}
        subtitle={isAdmin
          ? 'Every employee reports to one manager. Only admins can move someone to a different team.'
          : 'You can update the name and email of people on your team. You can add anyone to your projects.'}
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>Add person</Button>}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }} alignItems={{ sm: 'center' }}>
        <TextField
          placeholder="Search by name, email or title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ maxWidth: { sm: 320 } }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search people' },
          }}
        />
        {isAdmin ? (
          <TextField select label="Role" slotProps={SHOW_EMPTY_OPTION} value={role} onChange={(e) => setRole(e.target.value)} sx={{ maxWidth: { sm: 180 } }}>
            <MenuItem value="">Everyone</MenuItem>
            {Object.entries(ROLE_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{`${l}s`}</MenuItem>)}
          </TextField>
        ) : (
          <ToggleButtonGroup exclusive size="small" value={scope} onChange={(_, v) => v && setScope(v)} aria-label="Whose people">
            <ToggleButton value="team">My team</ToggleButton>
            <ToggleButton value="all">All employees</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading people" />}
      {data && people.length === 0 && (
        <EmptyState title={search ? 'No one matches that search' : 'No one here yet'}>
          {!isAdmin && scope === 'team' ? 'Ask an admin to assign employees to your team.' : null}
        </EmptyState>
      )}

      {people.length > 0 && (isWide ? (
        <TableContainer component={Paper} variant="outlined" sx={{ opacity: loading ? 0.6 : 1 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Reports to</TableCell>
                <TableCell align="right">Projects</TableCell>
                <TableCell align="right">Hours logged</TableCell>
                <TableCell align="right"><span className="visually-hidden">Actions</span></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map((u) => (
                <TableRow key={u.id} hover onClick={() => setViewing(u.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700 }}>{u.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{u.job_title || u.username}</Typography>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip size="small" variant={u.role === 'employee' ? 'outlined' : 'filled'} color={u.role === 'admin' ? 'secondary' : u.role === 'manager' ? 'primary' : 'default'} label={ROLE_LABEL[u.role]} />
                  </TableCell>
                  <TableCell>
                    {u.role === 'manager' ? `${u.team_size} on team` : u.manager_name || (u.role === 'employee' ? <Typography variant="body2" color="error">No manager</Typography> : '—')}
                  </TableCell>
                  <TableCell align="right">{u.project_count}</TableCell>
                  <TableCell align="right">{formatHours(u.total_hours)}</TableCell>
                  <TableCell align="right">{rowActions(u)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Stack spacing={1.5}>
          {people.map((u) => (
            <Paper key={u.id} variant="outlined" sx={{ p: 2, display: 'flex', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }} onClick={() => setViewing(u.id)}>
                <Typography sx={{ fontWeight: 700 }}>{u.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {[ROLE_LABEL[u.role], u.job_title, u.manager_name ? `reports to ${u.manager_name}` : null].filter(Boolean).join(', ')}
                </Typography>
                <Typography variant="body2" color="text.secondary">{`${u.project_count} projects, ${formatHours(u.total_hours)}`}</Typography>
              </Box>
              {rowActions(u)}
            </Paper>
          ))}
        </Stack>
      ))}

      <UserFormDialog
        open={Boolean(editing)}
        user={editing === 'new' ? null : editing}
        managers={managers || []}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          notify(editing === 'new' ? `Added ${saved.name}.` : `Saved changes to ${saved.name}.`);
          setEditing(null);
          reload();
        }}
      />
      {viewing && <PersonDialog userId={viewing} onClose={() => setViewing(null)} />}
      {archiving && (
        <ConfirmDialog
          open
          title={`Archive ${archiving.name}?`}
          message="They will no longer be able to sign in and will be removed from their projects. Their logged hours are kept, and you can restore them from the Archive."
          confirmLabel="Archive person"
          destructive
          onConfirm={async () => {
            try {
              await api.del(`/users/${archiving.id}`);
              notify(`${archiving.name} archived.`);
              reload();
            } catch (err) {
              notify(err.message, 'error');
              throw err;
            }
          }}
          onClose={() => setArchiving(null)}
        />
      )}
    </>
  );
}

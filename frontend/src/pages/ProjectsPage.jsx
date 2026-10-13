import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import {
  Box, Button, InputAdornment, Link, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { api } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useNotify } from '../services/NotifyContext';
import PageHeader from '../components/PageHeader';
import CapacityBar from '../components/CapacityBar';
import StatusChip from '../components/StatusChip';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import ProjectFormDialog from '../components/forms/ProjectFormDialog';
import {
  formatHours, formatMoney, formatShortDate, PROJECT_STATUS, SHOW_EMPTY_OPTION,
} from '../utils/format';

/** Project list with search and filters; admins create projects here. */
export default function ProjectsPage() {
  const { user, isAdmin } = useAuth();
  const notify = useNotify();
  const navigate = useNavigate();
  const isWide = useMediaQuery({ minWidth: 900 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [managerId, setManagerId] = useState('');
  const [creating, setCreating] = useState(false);

  const query = useDebounce(search);
  const {
    data: projects, loading, error, reload,
  } = useApi(() => api.get('/projects', { search: query, status, manager_id: managerId }), [query, status, managerId]);
  const { data: managers } = useApi(
    () => (isAdmin ? api.get('/users', { role: 'manager' }) : Promise.resolve([])),
    [isAdmin],
  );

  const title = user.role === 'employee' ? 'My projects' : user.role === 'manager' ? 'Projects you manage' : 'Projects';

  return (
    <>
      <PageHeader
        title={title}
        subtitle={user.role === 'manager'
          ? 'Admins create projects and assign them to you. You manage the team, milestones, budget and status.'
          : 'Planned hours assume 8 hours per weekday for each person on the project.'}
        actions={isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>New project</Button>
        )}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField
          placeholder="Search projects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ maxWidth: { sm: 320 } }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search projects' },
          }}
        />
        <TextField select label="Status" slotProps={SHOW_EMPTY_OPTION} value={status} onChange={(e) => setStatus(e.target.value)} sx={{ maxWidth: { sm: 180 } }}>
          <MenuItem value="">Any status</MenuItem>
          {Object.entries(PROJECT_STATUS).map(([k, s]) => <MenuItem key={k} value={k}>{s.label}</MenuItem>)}
        </TextField>
        {isAdmin && (
          <TextField select label="Manager" slotProps={SHOW_EMPTY_OPTION} value={managerId} onChange={(e) => setManagerId(e.target.value)} sx={{ maxWidth: { sm: 220 } }}>
            <MenuItem value="">Any manager</MenuItem>
            {(managers || []).map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
          </TextField>
        )}
      </Stack>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !projects && <Loading label="Loading projects" />}
      {projects && projects.length === 0 && (
        <EmptyState
          title={search || status || managerId ? 'No projects match these filters' : 'No projects yet'}
          action={isAdmin && !search && !status ? <Button variant="contained" onClick={() => setCreating(true)}>Create the first project</Button> : null}
        >
          {!isAdmin && !search && !status ? 'When you are assigned to a project it will show up here.' : null}
        </EmptyState>
      )}

      {projects && projects.length > 0 && (isWide ? (
        <TableContainer component={Paper} variant="outlined" sx={{ opacity: loading ? 0.6 : 1 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Manager</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell align="right">Budget</TableCell>
                <TableCell align="right">People</TableCell>
                <TableCell sx={{ width: 220 }}>Hours vs plan</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((p) => (
                <TableRow
                  key={p.id}
                  hover
                  onClick={() => navigate(`/projects/${p.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Link component={RouterLink} to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} sx={{ fontWeight: 700, color: 'text.primary' }} underline="hover">
                      {p.name}
                    </Link>
                    <Typography variant="body2" color="text.secondary" noWrap>{p.description}</Typography>
                  </TableCell>
                  <TableCell>{p.manager_name}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatShortDate(p.start_date)}
                    {' to '}
                    {formatShortDate(p.estimated_end_date)}
                  </TableCell>
                  <TableCell align="right">{formatMoney(p.budget)}</TableCell>
                  <TableCell align="right">{p.member_count}</TableCell>
                  <TableCell>
                    <CapacityBar logged={p.total_hours} planned={p.planned_hours} compact />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {`${formatHours(p.total_hours)} of ${formatHours(p.planned_hours)}`}
                    </Typography>
                  </TableCell>
                  <TableCell><StatusChip status={p.status} overdue={p.is_overdue} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Stack spacing={1.5}>
          {projects.map((p) => (
            <Paper key={p.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                <Link component={RouterLink} to={`/projects/${p.id}`} sx={{ fontWeight: 700, color: 'text.primary' }}>{p.name}</Link>
                <StatusChip status={p.status} overdue={p.is_overdue} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {`${p.manager_name}, due ${formatShortDate(p.estimated_end_date)}, ${p.member_count} people, ${formatMoney(p.budget)}`}
              </Typography>
              <CapacityBar logged={p.total_hours} planned={p.planned_hours} />
            </Paper>
          ))}
        </Stack>
      ))}

      <ProjectFormDialog
        open={creating}
        managers={managers || []}
        onClose={() => setCreating(false)}
        onSaved={(project) => {
          setCreating(false);
          notify(`Created ${project.name}.`);
          navigate(`/projects/${project.id}`);
        }}
      />
    </>
  );
}

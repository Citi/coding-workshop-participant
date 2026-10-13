import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import {
  Alert, AvatarGroup, Avatar, Box, Breadcrumbs, Button, Chip, IconButton, Link, Menu, MenuItem, Paper, Stack,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import PersonAddAlt from '@mui/icons-material/PersonAddAlt';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import useApi from '../hooks/useApi';
import { api } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useNotify } from '../services/NotifyContext';
import CapacityBar from '../components/CapacityBar';
import ConfirmDialog from '../components/ConfirmDialog';
import MilestoneTimeline from '../components/MilestoneTimeline';
import StatusChip from '../components/StatusChip';
import TimeEntriesTable from '../components/TimeEntriesTable';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import AssignMembersDialog from '../components/forms/AssignMembersDialog';
import MilestoneFormDialog from '../components/forms/MilestoneFormDialog';
import ProjectFormDialog from '../components/forms/ProjectFormDialog';
import TimeEntryDialog from '../components/forms/TimeEntryDialog';
import { tokens } from '../theme';
import {
  formatDate, formatDays, formatHours, formatMoney, formatShortDate,
} from '../utils/format';

const initials = (name) => name.split(' ').map((n) => n[0]).slice(0, 2).join('');

/** One label/value pair in the project's fact row. */
function Fact({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
      <Box sx={{ mt: 0.25 }}>{children}</Box>
    </Box>
  );
}

Fact.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node.isRequired };

/** Milestones tab: timeline plus a table with per-milestone actions. */
function MilestonesTab({
  project, onAdd, onEdit, onComplete, onArchive,
}) {
  const [menu, setMenu] = useState(null);
  const { milestones } = project;
  if (!milestones.length) {
    return (
      <EmptyState
        title="No milestones yet"
        action={project.can_manage ? <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>Add milestone</Button> : null}
      >
        Milestones mark the key deadlines and events in a project. Each has its own dates, budget and people.
      </EmptyState>
    );
  }
  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2.5, pt: 4 }}>
        <MilestoneTimeline
          start={project.start_date}
          end={project.estimated_end_date}
          milestones={milestones}
          onSelect={project.can_manage ? onEdit : undefined}
        />
      </Paper>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Milestone</TableCell>
              <TableCell>Dates</TableCell>
              <TableCell align="right">Budget</TableCell>
              <TableCell align="right">Hours</TableCell>
              <TableCell>People</TableCell>
              <TableCell>Status</TableCell>
              {project.can_manage && <TableCell align="right"><span className="visually-hidden">Actions</span></TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {milestones.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Typography sx={{ fontWeight: 700 }}>{m.name}</Typography>
                  {m.description && <Typography variant="body2" color="text.secondary">{m.description}</Typography>}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{`${formatShortDate(m.start_date)} to ${formatShortDate(m.end_date)}`}</TableCell>
                <TableCell align="right">{formatMoney(m.budget)}</TableCell>
                <TableCell align="right">{formatHours(m.total_hours)}</TableCell>
                <TableCell>
                  {m.members.length ? (
                    <AvatarGroup max={4} sx={{ justifyContent: 'flex-end', '& .MuiAvatar-root': { width: 28, height: 28, fontSize: '0.75rem' } }}>
                      {m.members.map((p) => (
                        <Tooltip key={p.id} title={p.name}><Avatar sx={{ bgcolor: tokens.inkSoft }}>{initials(p.name)}</Avatar></Tooltip>
                      ))}
                    </AvatarGroup>
                  ) : <Typography variant="body2" color="text.secondary">No one yet</Typography>}
                </TableCell>
                <TableCell><StatusChip kind="milestone" status={m.status} overdue={m.is_overdue} /></TableCell>
                {project.can_manage && (
                  <TableCell align="right">
                    <IconButton size="small" aria-label={`Actions for ${m.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, milestone: m })}>
                      <MoreVert fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { onEdit(menu.milestone); setMenu(null); }}>Edit milestone</MenuItem>
        {menu?.milestone.status !== 'completed' && (
          <MenuItem onClick={() => { onComplete(menu.milestone); setMenu(null); }}>Mark as completed</MenuItem>
        )}
        <MenuItem onClick={() => { onArchive(menu.milestone); setMenu(null); }}>Move to archive</MenuItem>
      </Menu>
    </Stack>
  );
}

MilestonesTab.propTypes = {
  project: PropTypes.object.isRequired,
  onAdd: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
};

/** Team tab: everyone on the project with hours against their personal capacity. */
function TeamTab({ project, onAdd, onRemove }) {
  if (!project.members.length) {
    return (
      <EmptyState
        title="No one is on this project yet"
        action={project.can_manage ? <Button variant="contained" startIcon={<PersonAddAlt />} onClick={onAdd}>Add people</Button> : null}
      >
        {project.can_manage ? 'Add people from your team or onboard someone from another team.' : 'The project manager has not assigned anyone yet.'}
      </EmptyState>
    );
  }
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell>Team</TableCell>
            <TableCell align="right">Logged</TableCell>
            <TableCell sx={{ width: 240 }}>Against an 8-hour day plan</TableCell>
            {project.can_manage && <TableCell align="right"><span className="visually-hidden">Actions</span></TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {project.members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Typography sx={{ fontWeight: 700 }}>{m.name}</Typography>
                <Typography variant="body2" color="text.secondary">{m.job_title}</Typography>
              </TableCell>
              <TableCell>
                {m.on_manager_team
                  ? <Typography variant="body2">{`${m.manager_name}'s team`}</Typography>
                  : <Chip size="small" variant="outlined" label={m.manager_name ? `On loan from ${m.manager_name}'s team` : 'No team'} />}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <Typography sx={{ fontWeight: 700 }}>{formatHours(m.hours)}</Typography>
                <Typography variant="body2" color="text.secondary">{formatDays(m.hours)}</Typography>
              </TableCell>
              <TableCell><CapacityBar logged={m.hours} planned={m.planned_hours} compact /></TableCell>
              {project.can_manage && (
                <TableCell align="right">
                  <Button size="small" color="inherit" onClick={() => onRemove(m)}>Remove</Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

TeamTab.propTypes = {
  project: PropTypes.object.isRequired,
  onAdd: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/** Project detail: facts, capacity, and tabs for milestones, team and time. */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const notify = useNotify();
  const navigate = useNavigate();
  const [tab, setTab] = useState('milestones');
  const [dialog, setDialog] = useState(null); // {type, payload}
  const [confirm, setConfirm] = useState(null);

  const {
    data: project, loading, error, reload,
  } = useApi(() => api.get(`/projects/${id}`), [id]);
  const time = useApi(() => api.get(`/projects/${id}/time-entries`), [id]);
  const { data: managers } = useApi(() => (isAdmin ? api.get('/users', { role: 'manager' }) : Promise.resolve([])), [isAdmin]);
  const { data: employees } = useApi(
    () => (user.role === 'employee' ? Promise.resolve([]) : api.get('/users', { role: 'employee' })),
    [user.role],
  );

  if (loading && !project) return <Loading label="Loading project" />;
  if (error) {
    return (
      <>
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} />
        <Button component={RouterLink} to="/projects">Back to projects</Button>
      </>
    );
  }

  const refresh = () => {
    reload();
    time.reload();
  };
  const close = () => setDialog(null);

  const run = async (action, success) => {
    try {
      await action();
      notify(success);
      refresh();
    } catch (err) {
      notify(err.message, 'error');
      throw err;
    }
  };

  const archived = Boolean(project.archived_at);
  const canEditEntry = (e) => !archived && (project.can_manage || e.user_id === user.id);

  return (
    <>
      <Breadcrumbs sx={{ mb: 1.5 }}>
        <Link component={RouterLink} to="/projects" color="inherit">Projects</Link>
        <Typography color="text.primary">{project.name}</Typography>
      </Breadcrumbs>

      {archived && <Alert severity="warning" sx={{ mb: 2 }}>This project is archived. Only admins can see it. Restore it from the Archive page to make changes.</Alert>}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box sx={{ minWidth: 0, flex: '1 1 360px' }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h1">{project.name}</Typography>
            <StatusChip status={project.status} overdue={project.is_overdue} />
          </Box>
          {project.description && <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: '70ch' }}>{project.description}</Typography>}
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {project.can_log_time && (
            <Button variant="contained" startIcon={<ScheduleOutlined />} onClick={() => setDialog({ type: 'time' })}>Log time</Button>
          )}
          {project.can_manage && !archived && (
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setDialog({ type: 'project' })}>Edit project</Button>
          )}
          {project.can_manage && !archived && project.status !== 'completed' && (
            <Button
              variant="outlined"
              onClick={() => setConfirm({
                title: 'Mark project as completed?',
                message: project.milestone_count > project.milestones_completed
                  ? `${project.milestone_count - project.milestones_completed} milestone(s) are still open. Complete them first.`
                  : 'The project will show as completed. An admin can then archive it.',
                confirmLabel: 'Mark as completed',
                action: () => run(() => api.put(`/projects/${project.id}`, { status: 'completed' }), 'Project marked as completed.'),
              })}
            >
              Mark complete
            </Button>
          )}
          {project.can_archive && (
            <Button
              variant="outlined"
              color="error"
              onClick={() => setConfirm({
                title: 'Archive this project?',
                message: 'It moves to the Archive, where only admins can see or restore it. Nothing is deleted.',
                confirmLabel: 'Archive project',
                destructive: true,
                action: async () => {
                  await run(() => api.del(`/projects/${project.id}`), 'Project archived.');
                  navigate('/projects');
                },
              })}
            >
              Archive
            </Button>
          )}
        </Stack>
      </Box>

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2.5, mb: 2.5 }}>
          <Fact label="Manager"><Typography>{project.manager_name}</Typography></Fact>
          <Fact label="Schedule">
            <Typography>{`${formatDate(project.start_date)} to ${formatDate(project.estimated_end_date)}`}</Typography>
            <Typography variant="body2" color="text.secondary">{`${project.working_days} working days (estimated end)`}</Typography>
          </Fact>
          <Fact label="Budget">
            <Typography>{formatMoney(project.budget)}</Typography>
            <Typography variant="body2" color="text.secondary">{`${formatMoney(project.budget_allocated)} allocated to milestones`}</Typography>
          </Fact>
          <Fact label="Time logged">
            <Typography>{`${formatHours(project.total_hours)} (${formatDays(project.total_hours)})`}</Typography>
            <Typography variant="body2" color="text.secondary">{`${project.member_count} ${project.member_count === 1 ? 'person' : 'people'} assigned`}</Typography>
          </Fact>
        </Box>
        <CapacityBar logged={project.total_hours} planned={project.planned_hours} label="planned at 8 h per person per weekday" />
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider', mb: 2.5, gap: 1, flexWrap: 'wrap' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          <Tab value="milestones" label={`Milestones (${project.milestone_count})`} />
          <Tab value="team" label={`Team (${project.member_count})`} />
          <Tab value="time" label="Time log" />
        </Tabs>
        {project.can_manage && !archived && tab === 'milestones' && (
          <Button startIcon={<AddIcon />} onClick={() => setDialog({ type: 'milestone' })}>Add milestone</Button>
        )}
        {project.can_manage && !archived && tab === 'team' && (
          <Button startIcon={<PersonAddAlt />} onClick={() => setDialog({ type: 'members' })}>Add people</Button>
        )}
      </Box>

      {tab === 'milestones' && (
        <MilestonesTab
          project={project}
          onAdd={() => setDialog({ type: 'milestone' })}
          onEdit={(m) => setDialog({ type: 'milestone', payload: m })}
          onComplete={(m) => run(() => api.put(`/milestones/${m.id}`, { status: 'completed' }), `${m.name} marked as completed.`).catch(() => {})}
          onArchive={(m) => setConfirm({
            title: `Archive ${m.name}?`,
            message: 'The milestone moves to the Archive. Logged hours stay on the project, and an admin can restore it.',
            confirmLabel: 'Archive milestone',
            destructive: true,
            action: () => run(() => api.del(`/milestones/${m.id}`), 'Milestone archived.'),
          })}
        />
      )}

      {tab === 'team' && (
        <TeamTab
          project={project}
          onAdd={() => setDialog({ type: 'members' })}
          onRemove={(m) => setConfirm({
            title: `Remove ${m.name} from this project?`,
            message: 'Their logged hours stay on the project. You can add them back at any time.',
            confirmLabel: 'Remove from project',
            action: () => run(() => api.del(`/projects/${project.id}/members/${m.id}`), `${m.name} removed from the project.`),
          })}
        />
      )}

      {tab === 'time' && (
        <>
          {time.error && <ErrorState error={time.error} onRetry={time.reload} />}
          {time.loading && !time.data && <Loading label="Loading time" />}
          {time.data && (time.data.entries.length === 0 ? (
            <EmptyState
              title="No time logged yet"
              action={project.can_log_time ? <Button variant="contained" onClick={() => setDialog({ type: 'time' })}>Log time</Button> : null}
            />
          ) : (
            <Stack spacing={2}>
              <Typography color="text.secondary">
                {`${formatHours(time.data.summary.total_hours)} in total (${formatDays(time.data.summary.total_hours)}). `}
                {time.data.summary.by_user.map((u) => `${u.user_name} ${formatHours(u.hours)}`).join(', ')}
              </Typography>
              <TimeEntriesTable
                entries={time.data.entries}
                showProject={false}
                showPerson={project.can_manage}
                canEdit={canEditEntry}
                onEdit={(e) => setDialog({ type: 'time', payload: e })}
                onArchive={(e) => setConfirm({
                  title: 'Archive this time entry?',
                  message: `${formatHours(e.hours)} on ${formatDate(e.work_date)} will no longer count toward totals. An admin can restore it.`,
                  confirmLabel: 'Archive entry',
                  destructive: true,
                  action: () => run(() => api.del(`/time-entries/${e.id}`), 'Time entry archived.'),
                })}
              />
            </Stack>
          ))}
        </>
      )}

      <ProjectFormDialog
        open={dialog?.type === 'project'}
        project={project}
        managers={managers || []}
        onClose={close}
        onSaved={() => { close(); notify('Project updated.'); refresh(); }}
      />
      <MilestoneFormDialog
        open={dialog?.type === 'milestone'}
        project={project}
        milestone={dialog?.type === 'milestone' ? dialog.payload || null : null}
        onClose={close}
        onSaved={(m) => { close(); notify(`Saved ${m.name}.`); refresh(); }}
      />
      {dialog?.type === 'members' && (
        <AssignMembersDialog
          open
          project={project}
          employees={employees || []}
          onClose={close}
          onSaved={(_, count) => { close(); notify(`Added ${count} ${count === 1 ? 'person' : 'people'} to the project.`); refresh(); }}
        />
      )}
      <TimeEntryDialog
        open={dialog?.type === 'time'}
        projects={[project]}
        projectId={project.id}
        entry={dialog?.type === 'time' ? dialog.payload || null : null}
        onClose={close}
        onSaved={() => { close(); notify(dialog?.payload ? 'Time entry updated.' : 'Time logged.'); refresh(); }}
      />
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onConfirm={confirm.action}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

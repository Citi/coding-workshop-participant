import { useState } from 'react';
import {
  Box, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import useApi from '../hooks/useApi';
import { api } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useNotify } from '../services/NotifyContext';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import TimeEntriesTable from '../components/TimeEntriesTable';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import TimeEntryDialog from '../components/forms/TimeEntryDialog';
import {
  formatDate, formatDays, formatHours, SHOW_EMPTY_OPTION, todayIso,
} from '../utils/format';

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Time log with filters and totals by person and project. */
export default function TimePage() {
  const { user } = useAuth();
  const notify = useNotify();
  const isEmployee = user.role === 'employee';
  const [filters, setFilters] = useState({
    project_id: '', user_id: '', from: daysAgoIso(30), to: todayIso(),
  });
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const {
    data, loading, error, reload,
  } = useApi(() => api.get('/time-entries', filters), [filters.project_id, filters.user_id, filters.from, filters.to]);
  const { data: projects } = useApi(() => api.get('/projects'), []);
  const { data: people } = useApi(() => (isEmployee ? Promise.resolve([]) : api.get('/users', { role: 'employee' })), [isEmployee]);

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const managedIds = new Set((projects || []).filter((p) => p.can_manage).map((p) => p.id));
  const canEdit = (e) => e.user_id === user.id || managedIds.has(e.project_id);

  return (
    <>
      <PageHeader
        title={isEmployee ? 'My time' : 'Time log'}
        subtitle={isEmployee
          ? 'Log hours on the projects you are assigned to. A full day is 8 hours.'
          : 'Hours logged on the projects you can see. One day equals 8 hours.'}
        actions={(
          <Button variant="contained" startIcon={<ScheduleOutlined />} onClick={() => setDialog({})} disabled={!projects?.length}>
            Log time
          </Button>
        )}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        <TextField select label="Project" slotProps={SHOW_EMPTY_OPTION} value={filters.project_id} onChange={set('project_id')} sx={{ maxWidth: { md: 260 } }}>
          <MenuItem value="">All projects</MenuItem>
          {(projects || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        {!isEmployee && (
          <TextField select label="Person" slotProps={SHOW_EMPTY_OPTION} value={filters.user_id} onChange={set('user_id')} sx={{ maxWidth: { md: 220 } }}>
            <MenuItem value="">Everyone</MenuItem>
            {(people || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        )}
        <TextField label="From" type="date" value={filters.from} onChange={set('from')} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: { md: 180 } }} />
        <TextField label="To" type="date" value={filters.to} onChange={set('to')} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: { md: 180 } }} />
      </Stack>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading time" />}
      {data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 300px' }, gap: 3, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0, order: { xs: 2, lg: 1 } }}>
            {data.entries.length === 0 ? (
              <EmptyState title="No time logged for these filters">
                {isEmployee ? 'Use Log time to record the hours you worked.' : 'Try a wider date range or a different project.'}
              </EmptyState>
            ) : (
              <TimeEntriesTable
                entries={data.entries}
                showPerson={!isEmployee}
                canEdit={canEdit}
                onEdit={(e) => setDialog({ entry: e })}
                onArchive={(e) => setConfirm(e)}
              />
            )}
          </Box>
          <Paper variant="outlined" sx={{ p: 2.5, order: { xs: 1, lg: 2 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>Total for this period</Typography>
            <Typography sx={{ fontSize: '1.75rem', fontWeight: 700 }}>{formatHours(data.summary.total_hours)}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>{formatDays(data.summary.total_hours)}</Typography>
            {!isEmployee && data.summary.by_user.length > 0 && (
              <>
                <Typography variant="h4" component="h2" sx={{ mt: 1 }}>By person</Typography>
                <Table size="small" sx={{ mb: 2 }}>
                  <TableBody>
                    {data.summary.by_user.map((r) => (
                      <TableRow key={r.user_id}>
                        <TableCell sx={{ pl: 0 }}>{r.user_name}</TableCell>
                        <TableCell align="right" sx={{ pr: 0, whiteSpace: 'nowrap' }}>{formatHours(r.hours)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            {data.summary.by_project.length > 0 && (
              <>
                <Typography variant="h4" component="h2" sx={{ mt: 1 }}>By project</Typography>
                <Table size="small">
                  <TableHead><TableRow><TableCell sx={{ pl: 0 }}>Project</TableCell><TableCell align="right" sx={{ pr: 0 }}>Hours</TableCell></TableRow></TableHead>
                  <TableBody>
                    {data.summary.by_project.map((r) => (
                      <TableRow key={r.project_id}>
                        <TableCell sx={{ pl: 0 }}>{r.project_name}</TableCell>
                        <TableCell align="right" sx={{ pr: 0, whiteSpace: 'nowrap' }}>{formatHours(r.hours)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Paper>
        </Box>
      )}

      <TimeEntryDialog
        open={Boolean(dialog)}
        projects={(projects || []).filter((p) => p.can_manage || isEmployee)}
        entry={dialog?.entry || null}
        onClose={() => setDialog(null)}
        onSaved={() => { notify(dialog?.entry ? 'Time entry updated.' : 'Time logged.'); setDialog(null); reload(); }}
      />
      {confirm && (
        <ConfirmDialog
          open
          title="Archive this time entry?"
          message={`${formatHours(confirm.hours)} on ${formatDate(confirm.work_date)} will no longer count toward totals. An admin can restore it.`}
          confirmLabel="Archive entry"
          destructive
          onConfirm={async () => {
            try {
              await api.del(`/time-entries/${confirm.id}`);
              notify('Time entry archived.');
              reload();
            } catch (err) {
              notify(err.message, 'error');
              throw err;
            }
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

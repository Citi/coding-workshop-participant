import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Button, Paper, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Typography,
} from '@mui/material';
import useApi from '../hooks/useApi';
import { api } from '../services/api';
import { useNotify } from '../services/NotifyContext';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import {
  formatDate, formatHours, formatMoney, ROLE_LABEL,
} from '../utils/format';

const SECTIONS = [
  {
    key: 'projects',
    kind: 'projects',
    label: 'Projects',
    columns: [
      ['Project', (r) => <Typography sx={{ fontWeight: 700 }}>{r.name}</Typography>],
      ['Manager', (r) => r.manager_name],
      ['Ran', (r) => `${formatDate(r.start_date)} to ${formatDate(r.estimated_end_date)}`],
      ['Budget', (r) => formatMoney(r.budget)],
      ['Hours', (r) => formatHours(r.total_hours)],
    ],
  },
  {
    key: 'milestones',
    kind: 'milestones',
    label: 'Milestones',
    columns: [
      ['Milestone', (r) => <Typography sx={{ fontWeight: 700 }}>{r.name}</Typography>],
      ['Project', (r) => r.project_name],
      ['Dates', (r) => `${formatDate(r.start_date)} to ${formatDate(r.end_date)}`],
      ['Budget', (r) => formatMoney(r.budget)],
    ],
  },
  {
    key: 'users',
    kind: 'users',
    label: 'People',
    columns: [
      ['Name', (r) => <Typography sx={{ fontWeight: 700 }}>{r.name}</Typography>],
      ['Role', (r) => ROLE_LABEL[r.role]],
      ['Email', (r) => r.email],
    ],
  },
  {
    key: 'time_entries',
    kind: 'time-entries',
    label: 'Time entries',
    columns: [
      ['Date', (r) => formatDate(r.work_date)],
      ['Person', (r) => r.user_name],
      ['Project', (r) => r.project_name],
      ['Hours', (r) => formatHours(r.hours)],
      ['Note', (r) => r.note],
    ],
  },
];

function ArchiveTable({ section, rows, onRestore, busyId }) {
  if (!rows.length) {
    return <EmptyState title={`No archived ${section.label.toLowerCase()}`}>Archived items appear here and can be restored at any time.</EmptyState>;
  }
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {section.columns.map(([label]) => <TableCell key={label}>{label}</TableCell>)}
            <TableCell>Archived</TableCell>
            <TableCell align="right"><span className="visually-hidden">Actions</span></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              {section.columns.map(([label, render]) => <TableCell key={label}>{render(r)}</TableCell>)}
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {formatDate(r.archived_at)}
                {r.archived_by_name && <Typography variant="body2" color="text.secondary">{`by ${r.archived_by_name}`}</Typography>}
              </TableCell>
              <TableCell align="right">
                <Button size="small" variant="outlined" disabled={busyId === r.id} onClick={() => onRestore(r)}>
                  {busyId === r.id ? 'Restoring…' : 'Restore'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

ArchiveTable.propTypes = {
  section: PropTypes.object.isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRestore: PropTypes.func.isRequired,
  busyId: PropTypes.number,
};

/** Admin-only archive: nothing is deleted, everything can be restored. */
export default function ArchivePage() {
  const notify = useNotify();
  const [tab, setTab] = useState('projects');
  const [busyId, setBusyId] = useState(null);
  const {
    data, loading, error, reload,
  } = useApi(() => api.get('/archive'), []);

  const section = SECTIONS.find((s) => s.key === tab);

  const restore = async (row) => {
    setBusyId(row.id);
    try {
      await api.post(`/archive/${section.kind}/${row.id}/restore`);
      notify(`Restored ${row.name || 'time entry'}.`);
      reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Archive"
        subtitle="Nothing in the tracker is permanently deleted. Archived items are hidden from everyone except admins and can be restored here."
      />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading archive" />}
      {data && (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
              {SECTIONS.map((s) => <Tab key={s.key} value={s.key} label={`${s.label} (${data[s.key].length})`} />)}
            </Tabs>
          </Box>
          <ArchiveTable section={section} rows={data[tab]} onRestore={restore} busyId={busyId} />
        </>
      )}
    </>
  );
}

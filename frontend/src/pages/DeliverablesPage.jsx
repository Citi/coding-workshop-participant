import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import DeliverableDialog from '../components/portfolio/DeliverableDialog.jsx';
import { shortProjectName } from '../components/portfolio/budgetUtils.js';
import { OverdueFlag } from '../components/portfolio/Flags.jsx';
import PercentBar from '../components/portfolio/PercentBar.jsx';
import { parseId } from '../components/portfolio/formUtils.js';
import { useProjectsLookup, useUsersLookup } from '../components/portfolio/lookups.js';
import { withSelectedOption } from '../components/portfolio/selectOptions.js';
import { deliverableShape } from '../components/portfolio/shapes.js';
import useSearchParamText from '../components/portfolio/useSearchParamText.js';
import { useAuth } from '../auth/useAuth.js';
import { DELIVERABLE_STATUSES, STATUS_LABELS, toOptions } from '../constants.js';
import useApi from '../hooks/useApi.js';
import usePagination from '../hooks/usePagination.js';
import { useNotify } from '../notifications/useNotify.js';
import {
  createDeliverable,
  deleteDeliverable,
  listDeliverables,
  updateDeliverable,
} from '../services/deliverables.js';
import { formatDate } from '../utils/format.js';

const STATUS_OPTIONS = toOptions(DELIVERABLE_STATUSES, STATUS_LABELS);

/** Query-string keys of the filters, so a filtered view can be bookmarked or linked to. */
const FILTER_KEYS = ['q', 'project_id', 'status', 'assigned_user_id', 'overdue'];

/**
 * Read the select and checkbox filters from the URL, ignoring values the API would reject.
 * The search text (`q`) is handled by useSearchParamText.
 * @param {URLSearchParams} searchParams - Current query string.
 * @returns {{projectId: string, status: string, assigneeId: string, overdue: boolean}} Filters.
 */
function readFilters(searchParams) {
  const status = searchParams.get('status') ?? '';
  const projectId = parseId(searchParams.get('project_id'));
  const assigneeId = parseId(searchParams.get('assigned_user_id'));
  return {
    projectId: projectId ? String(projectId) : '',
    status: DELIVERABLE_STATUSES.includes(status) ? status : '',
    assigneeId: assigneeId ? String(assigneeId) : '',
    overdue: searchParams.get('overdue') === 'true',
  };
}

function TitleCell({ row }) {
  return (
    <Box component="span" sx={{ display: 'block' }}>
      <Box component="span" sx={{ display: 'block', fontWeight: 600 }}>
        {row.title}
      </Box>
      {row.status === 'BLOCKED' && row.blocked_reason ? (
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
          Blocked: {row.blocked_reason}
        </Typography>
      ) : null}
    </Box>
  );
}

TitleCell.propTypes = {
  row: deliverableShape.isRequired,
};

function DueCell({ row }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
        {formatDate(row.due_date)}
      </Box>
      {row.is_overdue ? <OverdueFlag /> : null}
    </Box>
  );
}

DueCell.propTypes = {
  row: deliverableShape.isRequired,
};

const COLUMNS = [
  { field: 'title', header: 'Deliverable', primary: true, render: (row) => <TitleCell row={row} /> },
  {
    field: 'project_name',
    header: 'Project',
    render: (row) => (
      <Link component={RouterLink} to={`/projects/${row.project_id}?tab=deliverables`} title={row.project_name}>
        {shortProjectName(row.project_name)}
      </Link>
    ),
  },
  { field: 'status', header: 'Status', render: (row) => <StatusChip status={row.status} /> },
  { field: 'assigned_user_name', header: 'Assignee', render: (row) => row.assigned_user_name ?? 'Unassigned' },
  { field: 'due_date', header: 'Due', render: (row) => <DueCell row={row} /> },
  {
    field: 'completion_percentage',
    header: 'Completion',
    render: (row) => (
      <PercentBar value={row.completion_percentage} tone={row.status === 'DONE' ? 'success' : 'primary'} barWidth={64} />
    ),
  },
];

/**
 * Portfolio-wide deliverables (route /deliverables), answering spec question 4: the key
 * deliverables and their completion status. Search plus project, status, assignee and
 * overdue filters (kept in the query string, so views can be linked), server pagination,
 * and create/edit for ADMIN, PM and LEAD and delete for ADMIN and PM.
 * @returns {JSX.Element} The page.
 */
export default function DeliverablesPage() {
  const { can } = useAuth();
  const notify = useNotify();
  const projects = useProjectsLookup();
  const users = useUsersLookup();
  const [searchParams, setSearchParams] = useSearchParams();
  // The box keeps its own state (typing never waits for the router); the settled text goes to the URL.
  const search = useSearchParamText('q', 300);
  const { page, rowsPerPage, limit, offset, setPage, setRowsPerPage, reset } = usePagination();
  const [dialog, setDialog] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filters = readFilters(searchParams);
  const query = search.settledText.trim();
  const projectId = parseId(filters.projectId);
  const assigneeId = parseId(filters.assigneeId);
  const { status, overdue } = filters;

  const { data, loading, error, reload } = useApi(
    (signal) =>
      listDeliverables(
        {
          q: query || undefined,
          project_id: projectId ?? undefined,
          status: status || undefined,
          assigned_user_id: assigneeId ?? undefined,
          overdue: overdue ? true : undefined,
          limit,
          offset,
        },
        { signal },
      ),
    [query, projectId, status, assigneeId, overdue, limit, offset],
  );

  const updateFilters = (changes) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(changes).forEach(([key, value]) => {
          if (value === '' || value === false || value === null || value === undefined) {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }
        });
        return next;
      },
      { replace: true },
    );
    reset();
  };

  const handleSearchChange = (value) => {
    search.setText(value);
    reset();
  };

  const clearFilters = () => {
    search.setText('');
    updateFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])));
  };
  const filtered = Boolean(query || projectId || status || assigneeId || overdue);

  const canCreate = can('create', 'deliverables');
  const canUpdate = can('update', 'deliverables');
  const canDelete = can('delete', 'deliverables');

  const handleSave = async (body) => {
    const editing = dialog?.deliverable ?? null;
    if (editing) {
      await updateDeliverable(editing.id, body);
    } else {
      await createDeliverable(body);
    }
    setDialog(null);
    notify.success(editing ? `Saved “${body.title}”.` : `Created “${body.title}”.`);
    reload();
  };

  const handleDelete = async () => {
    if (!toDelete) {
      return;
    }
    setDeleting(true);
    try {
      await deleteDeliverable(toDelete.id);
      notify.success(`Deleted “${toDelete.title}”.`);
      reload();
    } catch (deleteError) {
      notify.error(deleteError, 'The deliverable could not be deleted.');
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const rowActions =
    canUpdate || canDelete
      ? (row) => (
          <>
            {canUpdate ? (
              <Tooltip title="Edit">
                <IconButton size="small" aria-label={`Edit ${row.title}`} onClick={() => setDialog({ deliverable: row })}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            {canDelete ? (
              <Tooltip title="Delete">
                <IconButton size="small" aria-label={`Delete ${row.title}`} onClick={() => setToDelete(row)}>
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </>
        )
      : undefined;

  const projectOptions = withSelectedOption(projects.options, filters.projectId, (value) => `Project #${value}`);
  const assigneeOptions = withSelectedOption(users.options, filters.assigneeId, (value) => `User #${value}`);

  return (
    <>
      <PageHeader
        title="Deliverables"
        subtitle="Every deliverable across the portfolio, with its status, owner, due date and completion."
        actions={
          canCreate ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ deliverable: null })}>
              New deliverable
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        searchValue={search.text}
        onSearchChange={handleSearchChange}
        searchLabel="Search deliverables"
        searchPlaceholder="Title contains…"
        filters={[
          { name: 'project_id', label: 'Project', value: filters.projectId, options: projectOptions, allLabel: 'All projects' },
          { name: 'status', label: 'Status', value: status, options: STATUS_OPTIONS, allLabel: 'Any status' },
          { name: 'assigned_user_id', label: 'Assignee', value: filters.assigneeId, options: assigneeOptions, allLabel: 'Anyone' },
          { name: 'overdue', label: 'Overdue only', type: 'checkbox', value: overdue },
        ]}
        onFilterChange={(name, value) => updateFilters({ [name]: value })}
        onClear={clearFilters}
      />

      <DataTable
        columns={COLUMNS}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowActions={rowActions}
        ariaLabel="Deliverables"
        emptyTitle={filtered ? 'No deliverables match these filters' : 'No deliverables yet'}
        emptyMessage={
          filtered
            ? 'Try a different search or filter, or clear them all.'
            : 'Deliverables added to projects appear here.'
        }
        emptyAction={
          filtered ? (
            <Button onClick={clearFilters} startIcon={<FilterAltOffIcon />}>
              Clear filters
            </Button>
          ) : undefined
        }
        pagination={{
          total: data?.total ?? 0,
          page,
          rowsPerPage,
          onPageChange: setPage,
          onRowsPerPageChange: setRowsPerPage,
        }}
      />

      {dialog ? (
        <DeliverableDialog
          deliverable={dialog.deliverable}
          projectOptions={projects.options}
          userOptions={users.options}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete deliverable?"
        message={
          toDelete
            ? `“${toDelete.title}” and its dependency links will be removed. Allocations tied to it become project-level.`
            : undefined
        }
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

/** Takes no props. */
DeliverablesPage.propTypes = {};

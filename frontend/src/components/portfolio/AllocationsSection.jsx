import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AllocationDialog from './AllocationDialog.jsx';
import CapacityWarningAlert from './CapacityWarningAlert.jsx';
import { allocationTarget, formatWindow } from './capacityUtils.js';
import { parseId } from './formUtils.js';
import { optionShape } from './shapes.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import DataTable from '../DataTable.jsx';
import FilterBar from '../FilterBar.jsx';
import { useAuth } from '../../auth/useAuth.js';
import useApi from '../../hooks/useApi.js';
import usePagination from '../../hooks/usePagination.js';
import { useNotify } from '../../notifications/useNotify.js';
import {
  createAllocation,
  deleteAllocation,
  listAllocations,
  updateAllocation,
} from '../../services/allocations.js';

const COLUMNS = [
  { field: 'user_name', header: 'Person', primary: true },
  { field: 'project_name', header: 'Project' },
  { field: 'deliverable_title', header: 'Deliverable', render: (row) => allocationTarget(row) },
  { field: 'allocation_percentage', header: 'Allocation', align: 'right', render: (row) => `${row.allocation_percentage}%` },
  { field: 'period', header: 'Period', render: (row) => formatWindow(row.start_date, row.end_date) },
];

function describeAllocation(allocation) {
  return `${allocation.user_name} on ${allocation.project_name}`;
}

/**
 * Allocations list on the capacity page, filtered by person and project, with create, edit
 * and delete for ADMIN and PM. After a save that leaves someone above 100%, the API's
 * `capacity_warning` is shown as a warning alert (and a snackbar) with every conflict window;
 * the alert goes away once one of that person's allocations is deleted (it would be stale).
 * @param {object} props - Component props.
 * @param {{value: string, label: string}[]} props.userOptions - People for filters and the dialog.
 * @param {{value: string, label: string}[]} props.projectOptions - Projects for filters and the dialog.
 * @param {string} [props.defaultStartDate] - First day suggested for new allocations (ISO date).
 * @param {() => void} [props.onChanged] - Called after any successful change, e.g. to reload capacity.
 * @returns {JSX.Element} The section.
 */
export default function AllocationsSection({ userOptions, projectOptions, defaultStartDate, onChanged }) {
  const { can } = useAuth();
  const notify = useNotify();
  const { page, rowsPerPage, limit, offset, setPage, setRowsPerPage, reset } = usePagination();
  const [userFilter, setUserFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dialog, setDialog] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [warning, setWarning] = useState(null);
  const headingId = useId();

  const userId = parseId(userFilter);
  const projectId = parseId(projectFilter);
  const { data, loading, error, reload } = useApi(
    (signal) =>
      listAllocations(
        { user_id: userId ?? undefined, project_id: projectId ?? undefined, limit, offset },
        { signal },
      ),
    [userId, projectId, limit, offset],
  );

  const canCreate = can('create', 'allocations');
  const canUpdate = can('update', 'allocations');
  const canDelete = can('delete', 'allocations');

  const handleFilterChange = (name, value) => {
    if (name === 'user_id') {
      setUserFilter(value);
    } else {
      setProjectFilter(value);
    }
    reset();
  };

  const handleClear = () => {
    setUserFilter('');
    setProjectFilter('');
    reset();
  };

  const handleSave = async (body) => {
    const editing = dialog?.allocation ?? null;
    const saved = editing ? await updateAllocation(editing.id, body) : await createAllocation(body);
    setDialog(null);
    const capacityWarning = saved?.capacity_warning ?? null;
    setWarning(capacityWarning);
    if (capacityWarning) {
      notify.warning(capacityWarning.message || `${capacityWarning.user_name} is now over-allocated.`);
    } else {
      notify.success(editing ? 'Allocation updated.' : 'Allocation created.');
    }
    reload();
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!toDelete) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAllocation(toDelete.id);
      notify.success('Allocation deleted.');
      // The warning described this person's load before the delete; it no longer holds.
      setWarning((current) =>
        current && (!current.user_id || current.user_id === toDelete.user_id) ? null : current,
      );
      reload();
      onChanged?.();
    } catch (deleteError) {
      notify.error(deleteError, 'The allocation could not be deleted.');
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
                <IconButton
                  size="small"
                  aria-label={`Edit allocation: ${describeAllocation(row)}`}
                  onClick={() => setDialog({ allocation: row })}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            {canDelete ? (
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  aria-label={`Delete allocation: ${describeAllocation(row)}`}
                  onClick={() => setToDelete(row)}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </>
        )
      : undefined;

  const filtered = Boolean(userFilter || projectFilter);

  return (
    <Box component="section" aria-labelledby={headingId} sx={{ mt: 4 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1,
          mb: 2,
        }}
      >
        <Box>
          <Typography id={headingId} variant="h5" component="h2" sx={{ fontWeight: 600 }}>
            Allocations
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Who is assigned to which project or deliverable, at what share of their time.
          </Typography>
        </Box>
        {canCreate ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ allocation: null })}>
            New allocation
          </Button>
        ) : null}
      </Box>

      {warning ? <CapacityWarningAlert warning={warning} onClose={() => setWarning(null)} /> : null}

      <FilterBar
        filters={[
          { name: 'user_id', label: 'Person', value: userFilter, options: userOptions, allLabel: 'Everyone' },
          { name: 'project_id', label: 'Project', value: projectFilter, options: projectOptions, allLabel: 'All projects' },
        ]}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={COLUMNS}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowActions={rowActions}
        ariaLabel="Allocations"
        emptyTitle={filtered ? 'No allocations match these filters' : 'No allocations yet'}
        emptyMessage={
          filtered ? 'Try another person or project, or clear the filters.' : 'Allocate people to projects to track capacity.'
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
        <AllocationDialog
          allocation={dialog.allocation}
          userOptions={userOptions}
          projectOptions={projectOptions}
          defaultStartDate={defaultStartDate}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete allocation?"
        message={toDelete ? `This removes ${describeAllocation(toDelete)} (${toDelete.allocation_percentage}%, ${formatWindow(toDelete.start_date, toDelete.end_date)}). Capacity figures update at once.` : undefined}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </Box>
  );
}

AllocationsSection.propTypes = {
  userOptions: PropTypes.arrayOf(optionShape).isRequired,
  projectOptions: PropTypes.arrayOf(optionShape).isRequired,
  defaultStartDate: PropTypes.string,
  onChanged: PropTypes.func,
};

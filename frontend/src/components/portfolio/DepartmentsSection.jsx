import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DepartmentDialog from './DepartmentDialog.jsx';
import { departmentShape } from './shapes.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import DataTable from '../DataTable.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { useNotify } from '../../notifications/useNotify.js';
import { createDepartment, deleteDepartment, updateDepartment } from '../../services/departments.js';
import { formatDate } from '../../utils/format.js';

const COLUMNS = [
  { field: 'name', header: 'Department', primary: true },
  { field: 'created_at', header: 'Created', render: (row) => formatDate(row.created_at) },
];

/**
 * Departments section of the Users page: list, create, rename and delete (ADMIN only, with a
 * confirmation). A department still used by projects cannot be deleted; the API's 409
 * message is shown above the list and in a snackbar.
 * @param {object} props - Component props.
 * @param {{items: object[], loading: boolean, error: Error|null, reload: () => void}} props.departments -
 *   Departments loaded by the page (see `useDepartmentsLookup`).
 * @param {() => void} [props.onChanged] - Called after any change, e.g. to reload the users list.
 * @returns {JSX.Element} The section.
 */
export default function DepartmentsSection({ departments, onChanged }) {
  const { can } = useAuth();
  const notify = useNotify();
  const headingId = useId();
  const [dialog, setDialog] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [conflict, setConflict] = useState('');

  const canCreate = can('create', 'departments');
  const canUpdate = can('update', 'departments');
  const canDelete = can('delete', 'departments');

  const handleSave = async ({ name }) => {
    const editing = dialog?.department ?? null;
    if (editing) {
      await updateDepartment(editing.id, { name });
    } else {
      await createDepartment({ name });
    }
    setDialog(null);
    notify.success(editing ? `Renamed ${editing.name} to ${name}.` : `Created the ${name} department.`);
    departments.reload();
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!toDelete) {
      return;
    }
    setDeleting(true);
    setConflict('');
    try {
      await deleteDepartment(toDelete.id);
      notify.success(`Deleted the ${toDelete.name} department.`);
      departments.reload();
      onChanged?.();
    } catch (error) {
      if (error?.status === 409) {
        setConflict(`${toDelete.name} was not deleted. ${error.message}`);
      }
      notify.error(error, 'The department could not be deleted.');
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
              <Tooltip title="Rename">
                <IconButton size="small" aria-label={`Rename ${row.name}`} onClick={() => setDialog({ department: row })}>
                  <DriveFileRenameOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            {canDelete ? (
              <Tooltip title="Delete">
                <IconButton size="small" aria-label={`Delete ${row.name}`} onClick={() => setToDelete(row)}>
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </>
        )
      : undefined;

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
            Departments
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Every project belongs to a department; people may belong to one.
          </Typography>
        </Box>
        {canCreate ? (
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialog({ department: null })}>
            New department
          </Button>
        ) : null}
      </Box>

      {conflict ? (
        <Alert severity="error" onClose={() => setConflict('')} sx={{ mb: 2 }}>
          {conflict}
        </Alert>
      ) : null}

      <DataTable
        columns={COLUMNS}
        rows={departments.items}
        loading={departments.loading}
        error={departments.error}
        onRetry={departments.reload}
        rowActions={rowActions}
        ariaLabel="Departments"
        emptyTitle="No departments yet"
        emptyMessage="Create a department before adding projects."
      />

      {dialog ? (
        <DepartmentDialog department={dialog.department} onSave={handleSave} onClose={() => setDialog(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete department?"
        message={
          toDelete
            ? `${toDelete.name} will be removed and its people will have no department. A department that still has projects cannot be deleted.`
            : undefined
        }
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </Box>
  );
}

DepartmentsSection.propTypes = {
  departments: PropTypes.shape({
    items: PropTypes.arrayOf(departmentShape).isRequired,
    loading: PropTypes.bool,
    error: PropTypes.oneOfType([PropTypes.instanceOf(Error), PropTypes.object]),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  onChanged: PropTypes.func,
};

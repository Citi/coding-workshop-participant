import { useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/Add';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import DeliverableFormDialog from './DeliverableFormDialog.jsx';
import RowActions from './RowActions.jsx';
import SectionHeader from './SectionHeader.jsx';
import { useConfirmDelete } from './useConfirmDelete.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import DataTable from '../DataTable.jsx';
import StatusChip from '../StatusChip.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { useApi } from '../../hooks/useApi.js';
import { usePagination } from '../../hooks/usePagination.js';
import { useNotify } from '../../notifications/useNotify.js';
import { deleteDeliverable, listDeliverables } from '../../services/deliverables.js';
import { formatDate } from '../../utils/format.js';

/**
 * Deliverable title with its blocked reason underneath when it is blocked.
 * @param {object} props - Component props.
 * @param {{title: string, status: string, blocked_reason?: string|null}} props.deliverable - DeliverableOut.
 * @returns {JSX.Element} The cell content.
 */
function TitleCell({ deliverable }) {
  return (
    <Box component="span" sx={{ display: 'block' }}>
      <Box component="span" sx={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>
        {deliverable.title}
      </Box>
      {deliverable.status === 'BLOCKED' && deliverable.blocked_reason ? (
        <Box component="span" sx={{ display: 'block', typography: 'body2', color: 'text.secondary', fontWeight: 400 }}>
          Blocked: {deliverable.blocked_reason}
        </Box>
      ) : null}
    </Box>
  );
}

TitleCell.propTypes = {
  deliverable: PropTypes.shape({
    title: PropTypes.string.isRequired,
    status: PropTypes.string,
    blocked_reason: PropTypes.string,
  }).isRequired,
};

/**
 * Completion as a short progress bar with the percentage in text.
 * @param {object} props - Component props.
 * @param {string} props.title - Deliverable title, for the bar's accessible name.
 * @param {number} props.value - Completion percentage.
 * @returns {JSX.Element} The cell content.
 */
function CompletionCell({ title, value }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 120 }}>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, value ?? 0))}
        aria-label={`${title} completion`}
        sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
      />
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' }}>
        {value ?? 0}%
      </Box>
    </Stack>
  );
}

CompletionCell.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.number,
};

/**
 * Due date, with an "Overdue" chip (text, not only colour) when the API flags it.
 * @param {object} props - Component props.
 * @param {string} props.date - ISO due date.
 * @param {boolean} [props.overdue] - `is_overdue` from the API.
 * @returns {JSX.Element} The cell content.
 */
function DueCell({ date, overdue = false }) {
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
        {formatDate(date)}
      </Box>
      {overdue ? (
        <Chip size="small" color="error" variant="outlined" icon={<EventBusyOutlinedIcon />} label="Overdue" />
      ) : null}
    </Stack>
  );
}

DueCell.propTypes = {
  date: PropTypes.string,
  overdue: PropTypes.bool,
};

const COLUMNS = [
  { field: 'title', header: 'Deliverable', primary: true, render: (row) => <TitleCell deliverable={row} /> },
  { field: 'status', header: 'Status', render: (row) => <StatusChip status={row.status} /> },
  {
    field: 'completion_percentage',
    header: 'Completion',
    render: (row) => <CompletionCell title={row.title} value={row.completion_percentage} />,
  },
  { field: 'due_date', header: 'Due', render: (row) => <DueCell date={row.due_date} overdue={row.is_overdue} /> },
  { field: 'assigned_user_name', header: 'Assignee' },
];

/**
 * Deliverables tab of a project (spec 1, question 4): status, completion, due date with an
 * overdue flag and assignee for each deliverable. ADMIN, PM and LEAD can create and edit;
 * ADMIN and PM can delete (after a confirm step).
 * @param {object} props - Component props.
 * @param {{id: number, project_name?: string}} props.project - The project.
 * @param {() => void} [props.onChanged] - Called after a change (completion and risk change).
 * @returns {JSX.Element} The tab content.
 */
export default function DeliverablesTab({ project, onChanged }) {
  const { can } = useAuth();
  const notify = useNotify();
  const [dialog, setDialog] = useState(null);
  const { page, rowsPerPage, limit, offset, setPage, setRowsPerPage } = usePagination();
  const projectId = project.id;
  const { data, error, loading, reload } = useApi(
    (signal) => listDeliverables({ project_id: projectId, limit, offset }, { signal }),
    [projectId, limit, offset],
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const canCreate = can('create', 'deliverables');
  const canUpdate = can('update', 'deliverables');
  const canDelete = can('delete', 'deliverables');

  const afterChange = () => {
    reload();
    if (onChanged) {
      onChanged();
    }
  };

  const removal = useConfirmDelete({
    remove: (deliverable) => deleteDeliverable(deliverable.id),
    successMessage: (deliverable) => `Deleted ${deliverable.title}.`,
    failureMessage: 'The deliverable was not deleted.',
    onDeleted: () => {
      if (rows.length === 1 && page > 0) {
        setPage(page - 1);
      }
      afterChange();
    },
    onFailed: reload,
  });

  const handleSaved = ({ deliverable, changed }) => {
    const editing = Boolean(dialog?.deliverable);
    setDialog(null);
    if (!changed) {
      notify.info('No changes to save.');
      return;
    }
    notify.success(editing ? `Saved changes to ${deliverable.title}.` : `Created ${deliverable.title}.`);
    afterChange();
  };

  const createButton = canCreate ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ key: Date.now(), deliverable: null })}>
      New deliverable
    </Button>
  ) : null;

  const overdue = rows.filter((row) => row.is_overdue).length;
  const subtitle = data
    ? `${total} deliverable${total === 1 ? '' : 's'}${
        overdue ? ` · ${overdue} overdue${rows.length < total ? ' on this page' : ''}` : ''
      }`
    : 'Loading…';

  return (
    <Box>
      <SectionHeader title="Deliverables" subtitle={subtitle} actions={createButton} />
      <DataTable
        ariaLabel="Deliverables"
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No deliverables yet"
        emptyMessage="Deliverables track the work of this project: status, completion, due date and owner."
        emptyAction={createButton}
        rowActions={
          canUpdate || canDelete
            ? (row) => (
                <RowActions
                  name={row.title}
                  onEdit={canUpdate ? () => setDialog({ key: Date.now(), deliverable: row }) : undefined}
                  onDelete={canDelete ? () => removal.request(row) : undefined}
                />
              )
            : undefined
        }
        pagination={{ total, page, rowsPerPage, onPageChange: setPage, onRowsPerPageChange: setRowsPerPage }}
      />
      {dialog ? (
        <DeliverableFormDialog
          key={dialog.key}
          open
          projectId={project.id}
          deliverable={dialog.deliverable}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}
      <ConfirmDialog
        {...removal.dialogProps}
        title="Delete deliverable?"
        confirmLabel="Delete deliverable"
        message={
          removal.target
            ? `${removal.target.title} and its dependency links will be permanently deleted. Allocations that point at it stay on the project.`
            : ''
        }
      />
    </Box>
  );
}

DeliverablesTab.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    project_name: PropTypes.string,
  }).isRequired,
  onChanged: PropTypes.func,
};

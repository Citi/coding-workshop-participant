import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RiskChip from '../components/RiskChip.jsx';
import StatusChip from '../components/StatusChip.jsx';
import ProjectFormDialog from '../components/projects/ProjectFormDialog.jsx';
import RowActions from '../components/projects/RowActions.jsx';
import { projectPath } from '../components/projects/projectUtils.js';
import { useConfirmDelete } from '../components/projects/useConfirmDelete.js';
import { useAuth } from '../auth/useAuth.js';
import { PROJECT_STATUSES, RISK_LABELS, RISK_LEVELS, STATUS_LABELS, toOptions } from '../constants.js';
import useApi from '../hooks/useApi.js';
import useDebouncedValue from '../hooks/useDebouncedValue.js';
import usePagination from '../hooks/usePagination.js';
import { useNotify } from '../notifications/useNotify.js';
import { listDepartments } from '../services/departments.js';
import { deleteProject, listProjects } from '../services/projects.js';
import { formatDate, formatPct } from '../utils/format.js';

const STATUS_OPTIONS = toOptions(PROJECT_STATUSES, STATUS_LABELS);
const RISK_OPTIONS = toOptions(RISK_LEVELS, RISK_LABELS);
const FILTER_KEYS = ['department_id', 'status', 'risk_level'];
const COMPACT_CELLS = {
  '& .MuiTableCell-sizeSmall': { px: 1.25 },
  '& .MuiTableCell-sizeSmall:first-of-type': { pl: 2 },
  '& .MuiTableCell-sizeSmall:last-of-type': { pr: 2 },
};

/**
 * Read an enum filter from the query string, ignoring unknown values.
 * @param {string|null} value - Raw query value.
 * @param {readonly string[]} allowed - Accepted values.
 * @returns {string} The value, or '' when absent or unknown.
 */
function enumParam(value, allowed) {
  return value && allowed.includes(value) ? value : '';
}

/** Table columns (spec 12.3): name, department, manager, status, progress, spend, risk, end date. */
const COLUMNS = [
  {
    field: 'project_name',
    header: 'Project',
    primary: true,
    render: (project) => (
      <Link component={RouterLink} to={projectPath(project.id)} sx={{ fontWeight: 600 }}>
        {project.project_name}
      </Link>
    ),
  },
  { field: 'department_name', header: 'Department' },
  { field: 'project_manager_name', header: 'Project manager' },
  { field: 'status', header: 'Status', render: (project) => <StatusChip status={project.status} /> },
  { field: 'completion_pct', header: 'Complete', align: 'right', render: (project) => formatPct(project.completion_pct) },
  {
    field: 'utilization_pct',
    header: 'Budget used',
    align: 'right',
    render: (project) => formatPct(project.utilization_pct),
  },
  {
    field: 'risk_score',
    header: 'Risk',
    render: (project) => <RiskChip level={project.risk_level} score={project.risk_score} />,
  },
  {
    field: 'end_date',
    header: 'End date',
    render: (project) => (
      <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
        {formatDate(project.end_date)}
      </Box>
    ),
  },
];

/**
 * Projects list (route /projects): search and department, status and risk level filters mapped
 * to the API's query parameters (the filters live in the URL, so dashboard links and the Back
 * button keep them), server pagination, and create, edit and delete for ADMIN and PM only.
 * @returns {JSX.Element} The page.
 */
export default function ProjectsPage() {
  const { can } = useAuth();
  const notify = useNotify();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const query = useDebouncedValue(search.trim(), 300);
  const { page, rowsPerPage, limit, offset, setPage, setRowsPerPage, reset } = usePagination();

  const canCreate = can('create', 'projects');
  const canUpdate = can('update', 'projects');
  const canDelete = can('delete', 'projects');

  const status = enumParam(searchParams.get('status'), PROJECT_STATUSES);
  const riskLevel = enumParam(searchParams.get('risk_level'), RISK_LEVELS);
  const departmentId = /^\d+$/.test(searchParams.get('department_id') ?? '') ? searchParams.get('department_id') : '';

  const departments = useApi((signal) => listDepartments({ limit: 200 }, { signal }), []);
  const departmentOptions = (departments.data?.items ?? [])
    .map((department) => ({ value: String(department.id), label: department.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const { data, error, loading, reload } = useApi(
    (signal) =>
      listProjects(
        {
          q: query || undefined,
          department_id: departmentId || undefined,
          status: status || undefined,
          risk_level: riskLevel || undefined,
          limit,
          offset,
        },
        { signal },
      ),
    [query, departmentId, status, riskLevel, limit, offset],
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasFilters = Boolean(query || departmentId || status || riskLevel);

  const removal = useConfirmDelete({
    remove: (project) => deleteProject(project.id),
    successMessage: (project) => `Deleted ${project.project_name}.`,
    failureMessage: 'The project was not deleted.',
    onDeleted: () => {
      if (rows.length === 1 && page > 0) {
        setPage(page - 1);
      } else {
        reload();
      }
    },
    onFailed: reload,
  });

  const handleFilterChange = (name, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(name, String(value));
    } else {
      next.delete(name);
    }
    setSearchParams(next, { replace: true });
    reset();
  };

  const handleSearchChange = (value) => {
    setSearch(value);
    reset();
  };

  const handleClear = () => {
    setSearch('');
    const next = new URLSearchParams(searchParams);
    FILTER_KEYS.forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
    reset();
  };

  const openCreate = () => setDialog({ key: Date.now(), project: null });
  const openEdit = (project) => setDialog({ key: Date.now(), project });
  const handleSaved = ({ project, changed }) => {
    const editing = Boolean(dialog?.project);
    setDialog(null);
    if (!changed) {
      notify.info('No changes to save.');
      return;
    }
    notify.success(editing ? `Saved changes to ${project.project_name}.` : `Created ${project.project_name}.`);
    reload();
  };

  const createButton = canCreate ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
      New project
    </Button>
  ) : null;

  let emptyAction = createButton;
  if (hasFilters) {
    emptyAction = (
      <Button variant="outlined" onClick={handleClear}>
        Clear filters
      </Button>
    );
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Search, filter and manage every project in the portfolio."
        actions={createButton}
      />
      <FilterBar
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchLabel="Search projects"
        searchPlaceholder="Project name"
        filters={[
          {
            name: 'department_id',
            label: 'Department',
            value: departmentOptions.some((option) => option.value === departmentId) ? departmentId : '',
            options: departmentOptions,
          },
          { name: 'status', label: 'Status', value: status, options: STATUS_OPTIONS },
          { name: 'risk_level', label: 'Risk level', value: riskLevel, options: RISK_OPTIONS },
        ]}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />
      <Typography variant="body2" color="text.secondary" role="status" aria-live="polite" sx={{ mb: 1 }}>
        {loading && !data ? 'Loading projects…' : `${total} project${total === 1 ? '' : 's'}${hasFilters ? ' match the filters' : ''}`}
      </Typography>
      {/* Nine columns: tighter cell padding keeps the actions column in view at laptop widths. */}
      <Box sx={COMPACT_CELLS}>
        <DataTable
          ariaLabel="Projects"
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle={hasFilters ? 'No projects match these filters' : 'No projects yet'}
          emptyMessage={
            hasFilters
              ? 'Try a different search, or clear the filters to see every project.'
              : 'Projects you create appear here with their status, progress, spend and risk.'
          }
          emptyAction={emptyAction}
          rowActions={
            canUpdate || canDelete
              ? (project) => (
                  <RowActions
                    name={project.project_name}
                    onEdit={canUpdate ? () => openEdit(project) : undefined}
                    onDelete={canDelete ? () => removal.request(project) : undefined}
                  />
                )
              : undefined
          }
          pagination={{ total, page, rowsPerPage, onPageChange: setPage, onRowsPerPageChange: setRowsPerPage }}
        />
      </Box>
      {dialog ? (
        <ProjectFormDialog
          key={dialog.key}
          open
          project={dialog.project}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}
      <ConfirmDialog
        {...removal.dialogProps}
        title="Delete project?"
        confirmLabel="Delete project"
        message={
          removal.target
            ? `${removal.target.project_name} and all of its deliverables, dependencies, allocations and budget entries will be permanently deleted.`
            : ''
        }
      />
    </>
  );
}

/** Takes no props. */
ProjectsPage.propTypes = {};

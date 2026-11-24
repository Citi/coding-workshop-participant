import { useId, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ErrorState from '../components/ErrorState.jsx';
import LoadingState from '../components/LoadingState.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RiskChip from '../components/RiskChip.jsx';
import StatusChip from '../components/StatusChip.jsx';
import BudgetTab from '../components/projects/BudgetTab.jsx';
import DeliverablesTab from '../components/projects/DeliverablesTab.jsx';
import DependenciesTab from '../components/projects/DependenciesTab.jsx';
import ProjectFormDialog from '../components/projects/ProjectFormDialog.jsx';
import ProjectOverviewTab from '../components/projects/ProjectOverviewTab.jsx';
import RiskTab from '../components/projects/RiskTab.jsx';
import { DEFAULT_PROJECT_TAB, PROJECT_TABS, isRecordId, normaliseTab } from '../components/projects/projectUtils.js';
import { useConfirmDelete } from '../components/projects/useConfirmDelete.js';
import { useAuth } from '../auth/useAuth.js';
import useApi from '../hooks/useApi.js';
import { useNotify } from '../notifications/useNotify.js';
import { ApiError } from '../services/apiClient.js';
import { deleteProject, getProject } from '../services/projects.js';
import { formatDate, formatPct } from '../utils/format.js';

const BACK_TO_PROJECTS = (
  <Button component={RouterLink} to="/projects" color="inherit" size="small" startIcon={<ArrowBackIcon />}>
    All projects
  </Button>
);

/**
 * Project detail (route /projects/:id) with Overview, Deliverables, Dependencies, Budget and
 * Risk tabs addressed as `?tab=overview|deliverables|dependencies|budget|risk` (default
 * overview), so the dashboard and the Risk page can link straight to a tab. ADMIN and PM can
 * edit and delete the project from the header.
 * @returns {JSX.Element} The page.
 */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const idPrefix = useId();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editKey, setEditKey] = useState(null);
  // Bumped each time the page reloads the project after a change, so the Risk tab recalculates too.
  const [revision, setRevision] = useState(0);
  const tab = normaliseTab(searchParams.get('tab'));
  const validId = isRecordId(id);
  const { data, error, reload } = useApi((signal) => getProject(id, { signal }), [id], { enabled: validId });
  const project = data && String(data.id) === String(id) ? data : null;

  const removal = useConfirmDelete({
    remove: (target) => deleteProject(target.id),
    successMessage: (target) => `Deleted ${target.project_name}.`,
    failureMessage: 'The project was not deleted.',
    onDeleted: () => navigate('/projects', { replace: true }),
  });

  if (!project) {
    let body = <LoadingState message="Loading project…" />;
    if (!validId) {
      body = (
        <ErrorState
          error={new ApiError({ status: 404, error: 'NOT_FOUND', message: 'There is no project at this address.' })}
          action={BACK_TO_PROJECTS}
        />
      );
    } else if (error) {
      body = <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} action={BACK_TO_PROJECTS} />;
    }
    return (
      <>
        <PageHeader title="Project details" subtitle={`Project #${id}`} />
        {body}
      </>
    );
  }

  const changeTab = (_, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === DEFAULT_PROJECT_TAB) {
      next.delete('tab');
    } else {
      next.set('tab', value);
    }
    setSearchParams(next, { replace: true });
  };

  const refresh = () => {
    setRevision((count) => count + 1);
    reload();
  };

  const handleSaved = ({ project: saved, changed }) => {
    setEditKey(null);
    if (!changed) {
      notify.info('No changes to save.');
      return;
    }
    notify.success(`Saved changes to ${saved.project_name}.`);
    refresh();
  };

  const canUpdate = can('update', 'projects');
  const canDelete = can('delete', 'projects');
  const manager = project.project_manager_name ? `Managed by ${project.project_manager_name}` : 'No project manager';
  const tabId = (value) => `${idPrefix}-tab-${value}`;
  const panelId = (value) => `${idPrefix}-panel-${value}`;

  let panel;
  switch (tab) {
    case 'deliverables':
      panel = <DeliverablesTab project={project} onChanged={reload} />;
      break;
    case 'dependencies':
      panel = <DependenciesTab project={project} onChanged={reload} />;
      break;
    case 'budget':
      panel = <BudgetTab project={project} onChanged={reload} />;
      break;
    case 'risk':
      panel = <RiskTab project={project} revision={revision} />;
      break;
    default:
      panel = <ProjectOverviewTab project={project} />;
  }

  return (
    <>
      <PageHeader
        title={project.project_name}
        subtitle={`${project.department_name} · ${manager} · ${formatDate(project.start_date)} to ${formatDate(project.end_date)}`}
        breadcrumbs={
          <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 0.5 }}>
            <Link component={RouterLink} to="/projects" underline="hover" color="inherit">
              Projects
            </Link>
            <Typography color="text.primary" aria-current="page" sx={{ overflowWrap: 'anywhere' }}>
              {project.project_name}
            </Typography>
          </Breadcrumbs>
        }
        actions={
          canUpdate || canDelete ? (
            <>
              {canUpdate ? (
                <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditKey(Date.now())}>
                  Edit
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => removal.request(project)}
                >
                  Delete
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: -1.5, mb: 2 }}>
        <StatusChip status={project.status} />
        <RiskChip level={project.risk_level} score={project.risk_score} />
        <Typography variant="body2" color="text.secondary">
          {formatPct(project.completion_pct)} complete · {formatPct(project.utilization_pct)} of budget used
        </Typography>
      </Stack>
      {error ? <ErrorState error={error} onRetry={refresh} title="Could not refresh this project" /> : null}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={tab}
          onChange={changeTab}
          aria-label="Project sections"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          {PROJECT_TABS.map((item) => (
            <Tab key={item.value} value={item.value} label={item.label} id={tabId(item.value)} aria-controls={panelId(item.value)} />
          ))}
        </Tabs>
      </Box>
      <Box role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
        {panel}
      </Box>
      {editKey ? (
        <ProjectFormDialog key={editKey} open project={project} onClose={() => setEditKey(null)} onSaved={handleSaved} />
      ) : null}
      <ConfirmDialog
        {...removal.dialogProps}
        title="Delete project?"
        confirmLabel="Delete project"
        message={`${project.project_name} and all of its deliverables, dependencies, allocations and budget entries will be permanently deleted.`}
      />
    </>
  );
}

/** Takes no props. */
ProjectDetailPage.propTypes = {};

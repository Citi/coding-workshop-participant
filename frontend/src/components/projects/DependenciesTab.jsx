import { useId } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import AddDependencyForm from './AddDependencyForm.jsx';
import DependencyLinkList from './DependencyLinkList.jsx';
import SectionHeader from './SectionHeader.jsx';
import { useConfirmDelete } from './useConfirmDelete.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import DependencyLayers from '../DependencyLayers.jsx';
import ErrorState from '../ErrorState.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { useApi } from '../../hooks/useApi.js';
import { deleteDependency, listDependencies } from '../../services/dependencies.js';
import { getProjectDependencyGraph } from '../../services/projects.js';

/** One page of edges is enough for one project's links (the API's largest page). */
const MAX_LINKS = 200;

/**
 * Column sizing for the shared DependencyLayers on desktop (md and up; phones keep its stacked
 * layout). It draws fixed 272px columns, so Alpha's four levels (1136px) overflowed the chain
 * box of a 1280px window and cut off the last card. Here the columns share the box instead,
 * between 150px and 360px each: four levels fit from a window of about 1000px, and a longer
 * chain still scrolls inside the box.
 */
const FLEXIBLE_LEVEL_COLUMNS = Object.freeze({
  '& [data-testid="dependency-level"]': {
    flex: { md: '1 1 0' },
    minWidth: { md: 150 },
    maxWidth: { md: 360 },
  },
});

/**
 * Dependencies tab of a project (spec 1, question 6): the chain drawn with DependencyLayers
 * (columns by topological level; root causes in the error colour and impacted items in the
 * warning colour, both also labelled in text), an "Add dependency" form for ADMIN, PM and LEAD
 * that shows a cycle rejection live, and the list of links with remove for ADMIN and PM.
 * @param {object} props - Component props.
 * @param {{id: number, project_name?: string}} props.project - The project.
 * @param {() => void} [props.onChanged] - Called after a dependency is added or removed (risk changes).
 * @returns {JSX.Element} The tab content.
 */
export default function DependenciesTab({ project, onChanged }) {
  const { can } = useAuth();
  const headingId = useId();
  const projectId = project.id;
  const graph = useApi((signal) => getProjectDependencyGraph(projectId, {}, { signal }), [projectId]);
  const links = useApi(
    (signal) => listDependencies({ project_id: projectId, limit: MAX_LINKS }, { signal }),
    [projectId],
  );

  const refresh = () => {
    graph.reload();
    links.reload();
    if (onChanged) {
      onChanged();
    }
  };

  const removal = useConfirmDelete({
    remove: (link) => deleteDependency(link.id),
    successMessage: (link) => `Removed: ${link.successor_title} no longer depends on ${link.predecessor_title}.`,
    failureMessage: 'The dependency was not removed.',
    onDeleted: refresh,
    onFailed: refresh,
  });

  const ownDeliverables = (graph.data?.nodes ?? [])
    .filter((node) => !node.is_external)
    .map((node) => ({ value: String(node.id), label: node.title }))
    .sort((a, b) => a.label.localeCompare(b.label));

  let chain;
  if (graph.error && !graph.data) {
    chain = <ErrorState error={graph.error} onRetry={graph.reload} />;
  } else if (!graph.data) {
    chain = <Skeleton variant="rounded" height={220} data-testid="dependency-skeleton" />;
  } else {
    chain = (
      <Box data-testid="dependency-chain" sx={FLEXIBLE_LEVEL_COLUMNS}>
        <DependencyLayers graph={graph.data} />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {can('create', 'dependencies') ? (
        <AddDependencyForm deliverables={ownDeliverables} loading={!graph.data} onAdded={refresh} />
      ) : null}
      <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2 }}>
        <SectionHeader
          id={headingId}
          title="Dependency chain"
          subtitle="A root cause is blocked or overdue; impacted deliverables sit downstream of one."
        />
        {graph.error && graph.data ? <ErrorState error={graph.error} onRetry={graph.reload} /> : null}
        {chain}
      </Paper>
      <DependencyLinkList
        links={links.data?.items ?? []}
        projectId={projectId}
        loading={links.loading}
        error={links.error}
        onRetry={links.reload}
        onDelete={can('delete', 'dependencies') ? removal.request : undefined}
      />
      <ConfirmDialog
        {...removal.dialogProps}
        title="Remove dependency?"
        confirmLabel="Remove"
        message={
          removal.target
            ? `${removal.target.successor_title} will no longer wait for ${removal.target.predecessor_title}. The risk score is recalculated from the remaining links.`
            : ''
        }
      />
    </Stack>
  );
}

DependenciesTab.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    project_name: PropTypes.string,
  }).isRequired,
  onChanged: PropTypes.func,
};

import { useId, useMemo } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import EmptyState from './EmptyState.jsx';
import StatusChip from './StatusChip.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { IMPACTED_COLOR, ROOT_CAUSE_COLOR } from '../theme.js';
import { formatDate } from '../utils/format.js';

const COLUMN_WIDTH = 272;

/**
 * Group graph nodes into columns by topological level. Uses the API's `levels` when present
 * and falls back to each node's `level`; nodes missing from both go in the last column.
 * @param {{nodes?: object[], levels?: number[][]}} graph - Dependency graph from the API.
 * @returns {object[][]} Columns of nodes, level 0 first.
 */
function buildColumns(graph) {
  const nodes = graph.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const placed = new Set();
  const columns = [];

  if (Array.isArray(graph.levels) && graph.levels.length > 0) {
    graph.levels.forEach((ids) => {
      const column = (ids ?? []).map((id) => byId.get(id)).filter(Boolean);
      column.forEach((node) => placed.add(node.id));
      if (column.length > 0) {
        columns.push(column);
      }
    });
  } else {
    nodes.forEach((node) => {
      const level = Number.isInteger(node.level) && node.level >= 0 ? node.level : 0;
      while (columns.length <= level) {
        columns.push([]);
      }
      columns[level].push(node);
      placed.add(node.id);
    });
  }

  const leftovers = nodes.filter((node) => !placed.has(node.id));
  if (leftovers.length > 0) {
    columns.push(leftovers);
  }
  return columns.filter((column) => column.length > 0);
}

/**
 * Predecessor ids of a node: from `predecessor_ids` when given, otherwise from the edges.
 * @param {object} node - Graph node.
 * @param {object[]} edges - Graph edges.
 * @returns {number[]} Ids of deliverables this one depends on.
 */
function predecessorIds(node, edges) {
  if (Array.isArray(node.predecessor_ids)) {
    return node.predecessor_ids;
  }
  return edges
    .filter((edge) => edge.successor_deliverable_id === node.id)
    .map((edge) => edge.predecessor_deliverable_id);
}

function DependencyCard({ node, predecessorTitles, impact }) {
  let tone = null;
  if (node.is_root_cause) {
    tone = ROOT_CAUSE_COLOR;
  } else if (node.is_impacted) {
    tone = IMPACTED_COLOR;
  }
  const details = [
    `${node.completion_percentage ?? 0}% complete`,
    node.due_date ? `due ${formatDate(node.due_date)}` : null,
    node.assigned_user_name ? `owner ${node.assigned_user_name}` : null,
  ].filter(Boolean);

  return (
    <Card
      component="li"
      variant="outlined"
      data-testid={`dependency-node-${node.id}`}
      sx={{
        borderColor: tone ? `${tone}.main` : 'divider',
        borderLeftWidth: tone ? 6 : 1,
        bgcolor: 'background.paper',
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
          {node.title}
        </Typography>
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
          <StatusChip status={node.status} />
          {node.is_root_cause ? (
            <Chip size="small" color={ROOT_CAUSE_COLOR} icon={<ErrorOutlineOutlinedIcon />} label="Root cause" />
          ) : null}
          {node.is_impacted ? (
            <Chip size="small" color={IMPACTED_COLOR} icon={<WarningAmberIcon />} label="Impacted" />
          ) : null}
          {node.is_external ? <Chip size="small" variant="outlined" label="Other project" /> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {details.join(' · ')}
        </Typography>
        {impact && impact.caused_by ? (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Held up by {impact.caused_by}
            {typeof impact.depth === 'number' ? ` (${impact.depth} step${impact.depth === 1 ? '' : 's'} downstream)` : ''}
          </Typography>
        ) : null}
        <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
          <Box component="span" sx={{ fontWeight: 600 }}>
            Depends on:
          </Box>{' '}
          {predecessorTitles.length > 0 ? predecessorTitles.join(', ') : 'nothing'}
        </Typography>
      </CardContent>
    </Card>
  );
}

DependencyCard.propTypes = {
  node: PropTypes.shape({
    id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    status: PropTypes.string,
    completion_percentage: PropTypes.number,
    due_date: PropTypes.string,
    assigned_user_name: PropTypes.string,
    is_root_cause: PropTypes.bool,
    is_impacted: PropTypes.bool,
    is_external: PropTypes.bool,
  }).isRequired,
  predecessorTitles: PropTypes.arrayOf(PropTypes.string).isRequired,
  impact: PropTypes.shape({ caused_by: PropTypes.string, depth: PropTypes.number }),
};

/**
 * Dependency chain drawn as columns by topological level (spec 12.4): one card per
 * deliverable listing its predecessors. Root causes use the error colour and impacted
 * items the warning colour, and both also carry a text chip. No graph library.
 *
 * @param {object} props - Component props.
 * @param {{nodes: object[], edges?: object[], levels?: number[][], impacted?: object[]}} props.graph -
 *   Response of `GET /projects/{id}/dependency-graph`.
 * @param {string} [props.emptyMessage] - Shown when the project has no deliverables.
 * @returns {JSX.Element} The layered view.
 */
export default function DependencyLayers({ graph, emptyMessage = 'Add deliverables and dependencies to see the chain.' }) {
  const isMobile = useIsMobile();
  const headingPrefix = useId();
  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges = useMemo(() => graph?.edges ?? [], [graph]);
  const columns = useMemo(() => buildColumns(graph ?? {}), [graph]);
  const titleById = useMemo(() => new Map(nodes.map((node) => [node.id, node.title])), [nodes]);
  const impactById = useMemo(
    () => new Map((graph?.impacted ?? []).map((item) => [item.id, item])),
    [graph],
  );

  if (nodes.length === 0) {
    return (
      <Paper variant="outlined">
        <EmptyState title="No deliverables yet" message={emptyMessage} icon={<AccountTreeOutlinedIcon />} />
      </Paper>
    );
  }

  const rootCount = nodes.filter((node) => node.is_root_cause).length;
  const impactedCount = nodes.filter((node) => node.is_impacted).length;

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 2 }}
        aria-label="Legend"
      >
        <Chip
          size="small"
          color={ROOT_CAUSE_COLOR}
          icon={<ErrorOutlineOutlinedIcon />}
          label={`Root cause (${rootCount})`}
        />
        <Chip size="small" color={IMPACTED_COLOR} icon={<WarningAmberIcon />} label={`Impacted (${impactedCount})`} />
        <Typography variant="body2" color="text.secondary">
          Columns run left to right in dependency order; each card lists what it depends on.
        </Typography>
      </Stack>
      <Box
        sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 2,
          overflowX: isMobile ? 'visible' : 'auto',
          pb: 1,
        }}
      >
        {columns.map((column, index) => {
          const headingId = `${headingPrefix}-level-${index}`;
          return (
            <Box
              key={headingId}
              component="section"
              aria-labelledby={headingId}
              data-testid="dependency-level"
              sx={{ flex: isMobile ? 'none' : `0 0 ${COLUMN_WIDTH}px`, minWidth: 0 }}
            >
              <Typography id={headingId} variant="overline" component="h3" color="text.secondary">
                Level {index + 1} · {column.length} deliverable{column.length === 1 ? '' : 's'}
              </Typography>
              <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {column.map((node) => (
                  <DependencyCard
                    key={node.id}
                    node={node}
                    impact={impactById.get(node.id)}
                    predecessorTitles={predecessorIds(node, edges).map(
                      (id) => titleById.get(id) ?? `Deliverable #${id}`,
                    )}
                  />
                ))}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

DependencyLayers.propTypes = {
  graph: PropTypes.shape({
    nodes: PropTypes.arrayOf(PropTypes.object),
    edges: PropTypes.arrayOf(PropTypes.object),
    levels: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)),
    roots: PropTypes.arrayOf(PropTypes.number),
    impacted: PropTypes.arrayOf(PropTypes.object),
  }),
  emptyMessage: PropTypes.string,
};

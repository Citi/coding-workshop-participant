import { useMemo } from 'react';
import { Alert, Box, Paper, Stack, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import StatusChip from '../common/StatusChip';
import { formatDate } from '../../utils/formatters';

/**
 * Renders the dependency chains between a project's deliverables -- the
 * scenario's "what is the dependency chain between deliverables?".
 *
 * Takes the `{ nodes, edges }` graph the API returns and lays out each path.
 * A chain starts at a deliverable nothing depends on and follows the edges
 * forward. A visited set guards the walk: the backend rejects cycles on write,
 * but if one ever existed in the data this renders what it can and flags it
 * rather than looping forever.
 */

function buildChains(nodes, edges) {
  const byId = new Map(nodes.map((node) => [String(node.id), node]));

  // An edge is "from depends on dependsOn", so prerequisites come first when
  // the chain is read left to right.
  const successors = new Map();
  const hasPrerequisite = new Set();

  edges.forEach((edge) => {
    const from = String(edge.dependsOn);
    if (!successors.has(from)) successors.set(from, []);
    successors.get(from).push(String(edge.from));
    hasPrerequisite.add(String(edge.from));
  });

  // Roots are deliverables nothing else has to finish first.
  const roots = nodes.filter((node) => !hasPrerequisite.has(String(node.id)));

  const chains = [];
  const cyclic = [];

  const walk = (node, path, visited) => {
    const key = String(node.id);
    if (visited.has(key)) {
      cyclic.push([...path.map((n) => n.name), node.name]);
      return;
    }

    const nextVisited = new Set(visited).add(key);
    const nextPath = [...path, node];
    const nextIds = successors.get(key) ?? [];

    if (nextIds.length === 0) {
      // Single-node "chains" are just unconnected deliverables; not a chain.
      if (nextPath.length > 1) chains.push(nextPath);
      return;
    }

    // One prerequisite can unblock several deliverables, so a root may branch;
    // each branch is emitted as its own chain.
    nextIds.forEach((id) => {
      const successor = byId.get(id);
      if (successor) walk(successor, nextPath, nextVisited);
    });
  };

  roots.forEach((root) => walk(root, [], new Set()));

  return { chains, cyclic };
}

export default function DependencyChain({ nodes = [], edges = [] }) {
  const { chains, cyclic } = useMemo(() => buildChains(nodes, edges), [nodes, edges]);

  if (!nodes.length) {
    return (
      <Typography color="text.secondary">
        No deliverables yet — add one to start building the chain.
      </Typography>
    );
  }

  if (!edges.length) {
    return (
      <Typography color="text.secondary">
        No dependencies recorded. Link two deliverables to show the order they
        must be completed in.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      {cyclic.length > 0 && (
        <Alert severity="warning">
          A circular dependency was detected: {cyclic[0].join(' → ')}. These deliverables can
          never all be completed — edit one to break the loop.
        </Alert>
      )}

      {chains.map((chain, index) => (
        <Paper key={chain.map((item) => item.id).join('-') || index} sx={{ p: 2 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            // Long chains scroll within the card rather than widening the page.
            sx={{ overflowX: 'auto', pb: 1 }}
          >
            {chain.map((item, position) => (
              <Stack key={item.id} direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    minWidth: 170,
                    p: 1.5,
                    border: 1,
                    borderColor: item.isOverdue ? 'error.main' : 'divider',
                    borderRadius: 1,
                    bgcolor: 'background.default',
                  }}
                >
                  <Typography variant="h6" noWrap title={item.name}>
                    {item.name}
                  </Typography>
                  <Box sx={{ mt: 0.5, mb: 0.5 }}>
                    <StatusChip value={item.status} />
                  </Box>
                  <Typography
                    variant="caption"
                    color={item.isOverdue ? 'error.main' : 'text.secondary'}
                    display="block"
                  >
                    Due {formatDate(item.dueDate)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.completionPercentage}% complete
                  </Typography>
                </Box>

                {position < chain.length - 1 && (
                  // Decorative: the sequence is conveyed by the DOM order.
                  <ArrowForwardIcon fontSize="small" color="disabled" aria-hidden="true" />
                )}
              </Stack>
            ))}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

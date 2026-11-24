import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import FilterBar from '../components/FilterBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import ExpandableTable from '../components/portfolio/ExpandableTable.jsx';
import StateDiff from '../components/portfolio/StateDiff.jsx';
import { entityLabel, recordName, summarizeChange } from '../components/portfolio/auditUtils.js';
import { parseId } from '../components/portfolio/formUtils.js';
import { useUsersLookup } from '../components/portfolio/lookups.js';
import { AUDIT_ENTITY_TYPES, ENTITY_TYPE_LABELS, toOptions } from '../constants.js';
import useApi from '../hooks/useApi.js';
import useDebouncedValue from '../hooks/useDebouncedValue.js';
import usePagination from '../hooks/usePagination.js';
import { listAuditLogs } from '../services/auditLogs.js';
import { formatDateTime } from '../utils/format.js';

const ENTITY_OPTIONS = toOptions(AUDIT_ENTITY_TYPES, ENTITY_TYPE_LABELS);

const COLUMNS = [
  {
    field: 'created_at',
    header: 'When',
    render: (row) => (
      <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
        {formatDateTime(row.created_at)}
      </Box>
    ),
  },
  { field: 'action', header: 'Action', render: (row) => <StatusChip status={row.action} /> },
  {
    field: 'entity',
    header: 'Record',
    primary: true,
    render: (row) => {
      const name = recordName(row);
      return (
        <Box component="span" sx={{ display: 'block' }}>
          <Box component="span" sx={{ display: 'block', fontWeight: 600 }}>
            {entityLabel(row)}
          </Box>
          {name ? (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
              {name}
            </Typography>
          ) : null}
        </Box>
      );
    },
  },
  {
    field: 'actor_email',
    header: 'Changed by',
    render: (row) => row.actor_email ?? (row.actor_id ? `User #${row.actor_id}` : 'System'),
  },
  { field: 'summary', header: 'Summary', render: (row) => summarizeChange(row) },
];

/**
 * Audit log (route /audit, ADMIN and PM): every create, update and delete of business data,
 * newest first, filtered by entity type, entity id and actor. Each entry opens to show the
 * record's values before and after the change.
 * @returns {JSX.Element} The page.
 */
export default function AuditPage() {
  const users = useUsersLookup();
  const { page, rowsPerPage, limit, offset, setPage, setRowsPerPage, reset } = usePagination();
  const [entityType, setEntityType] = useState('');
  const [entityIdText, setEntityIdText] = useState('');
  const [actor, setActor] = useState('');

  const settledEntityId = useDebouncedValue(entityIdText, 400);
  const entityIdValid = entityIdText.trim() === '' || parseId(entityIdText) !== null;
  const entityId = parseId(settledEntityId);
  const actorId = parseId(actor);

  const { data, loading, error, reload } = useApi(
    (signal) =>
      listAuditLogs(
        {
          entity_type: entityType || undefined,
          entity_id: entityId ?? undefined,
          actor_id: actorId ?? undefined,
          limit,
          offset,
        },
        { signal },
      ),
    [entityType, entityId, actorId, limit, offset],
    { enabled: entityIdValid },
  );

  const filtered = Boolean(entityType || entityIdText || actor);

  const handleFilterChange = (name, value) => {
    if (name === 'entity_type') {
      setEntityType(value);
    } else {
      setActor(value);
    }
    reset();
  };

  const clearFilters = () => {
    setEntityType('');
    setEntityIdText('');
    setActor('');
    reset();
  };

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Every change to business data, newest first. Open an entry to compare the values before and after."
      />

      <FilterBar
        filters={[
          { name: 'entity_type', label: 'Record type', value: entityType, options: ENTITY_OPTIONS, allLabel: 'All types' },
          { name: 'actor_id', label: 'Changed by', value: actor, options: users.options, allLabel: 'Anyone' },
        ]}
        onFilterChange={handleFilterChange}
      >
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Record id"
            value={entityIdText}
            onChange={(event) => {
              setEntityIdText(event.target.value);
              reset();
            }}
            error={!entityIdValid}
            helperText={entityIdValid ? undefined : 'Enter a whole number.'}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 'auto' }}>
          <Button onClick={clearFilters} disabled={!filtered} startIcon={<FilterAltOffIcon />}>
            Clear filters
          </Button>
        </Grid>
      </FilterBar>

      <ExpandableTable
        columns={COLUMNS}
        rows={data?.items}
        renderDetail={(row) => <StateDiff action={row.action} before={row.before_state} after={row.after_state} />}
        detailLabel={(row) => `values before and after: ${entityLabel(row)}, ${row.action.toLowerCase()} at ${formatDateTime(row.created_at)}`}
        loading={loading}
        error={error}
        onRetry={reload}
        ariaLabel="Audit log entries"
        emptyTitle={filtered ? 'No entries match these filters' : 'No changes recorded yet'}
        emptyMessage={
          filtered
            ? 'Try another record type, id or person, or clear the filters.'
            : 'Creating, editing or deleting projects, deliverables, allocations and other records adds entries here.'
        }
        pagination={{
          total: data?.total ?? 0,
          page,
          rowsPerPage,
          onPageChange: setPage,
          onRowsPerPageChange: setRowsPerPage,
        }}
      />
    </>
  );
}

/** Takes no props. */
AuditPage.propTypes = {};

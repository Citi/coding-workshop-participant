import { useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import BudgetEntryFormDialog from './BudgetEntryFormDialog.jsx';
import RowActions from './RowActions.jsx';
import SectionHeader from './SectionHeader.jsx';
import { useConfirmDelete } from './useConfirmDelete.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import DataTable from '../DataTable.jsx';
import KpiTile from '../KpiTile.jsx';
import MoneyText from '../MoneyText.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { CATEGORY_LABELS, humanize } from '../../constants.js';
import { useApi } from '../../hooks/useApi.js';
import { usePagination } from '../../hooks/usePagination.js';
import { useNotify } from '../../notifications/useNotify.js';
import { deleteBudgetEntry, listBudgetEntries } from '../../services/budgetEntries.js';
import { formatDate, formatPct, toNumber } from '../../utils/format.js';

const COLUMNS = [
  { field: 'entry_date', header: 'Date', render: (entry) => formatDate(entry.entry_date) },
  {
    field: 'category',
    header: 'Category',
    primary: true,
    render: (entry) => CATEGORY_LABELS[entry.category] ?? humanize(entry.category),
  },
  { field: 'description', header: 'Description' },
  { field: 'amount', header: 'Amount', align: 'right', render: (entry) => <MoneyText value={entry.amount} /> },
];

/**
 * Budget tab of a project (spec 1, question 7): planned, spent and remaining totals, and the
 * budget entries the spend is summed from. ADMIN and PM can record, correct and delete entries.
 * @param {object} props - Component props.
 * @param {{id: number, planned_budget: string, actual_spend: string, remaining_budget: string,
 *   utilization_pct: number|null}} props.project - ProjectOut (its totals cover every entry).
 * @param {() => void} [props.onChanged] - Called after a change (spend and risk change).
 * @returns {JSX.Element} The tab content.
 */
export default function BudgetTab({ project, onChanged }) {
  const { can } = useAuth();
  const notify = useNotify();
  const [dialog, setDialog] = useState(null);
  const { page, rowsPerPage, limit, offset, setPage, setRowsPerPage } = usePagination();
  const projectId = project.id;
  const { data, error, loading, reload } = useApi(
    (signal) => listBudgetEntries({ project_id: projectId, limit, offset }, { signal }),
    [projectId, limit, offset],
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const remaining = toNumber(project.remaining_budget);

  const canCreate = can('create', 'budgetEntries');
  const canUpdate = can('update', 'budgetEntries');
  const canDelete = can('delete', 'budgetEntries');

  const afterChange = () => {
    reload();
    if (onChanged) {
      onChanged();
    }
  };

  const removal = useConfirmDelete({
    remove: (entry) => deleteBudgetEntry(entry.id),
    successMessage: () => 'Budget entry deleted.',
    failureMessage: 'The budget entry was not deleted.',
    onDeleted: () => {
      if (rows.length === 1 && page > 0) {
        setPage(page - 1);
      }
      afterChange();
    },
    onFailed: reload,
  });

  const handleSaved = ({ changed }) => {
    const editing = Boolean(dialog?.entry);
    setDialog(null);
    if (!changed) {
      notify.info('No changes to save.');
      return;
    }
    notify.success(editing ? 'Budget entry updated.' : 'Spend recorded.');
    afterChange();
  };

  const createButton = canCreate ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ key: Date.now(), entry: null })}>
      Record spend
    </Button>
  ) : null;

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }} component="section" aria-label="Budget totals">
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile label="Planned" value={<MoneyText value={project.planned_budget} sx={{ fontVariantNumeric: 'normal' }} />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Spent"
            value={<MoneyText value={project.actual_spend} sx={{ fontVariantNumeric: 'normal' }} />}
            hint={data ? `Sum of ${total} entr${total === 1 ? 'y' : 'ies'}` : undefined}
            tone="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Remaining"
            value={<MoneyText value={project.remaining_budget} highlightNegative sx={{ fontVariantNumeric: 'normal' }} />}
            hint={remaining !== null && remaining < 0 ? 'Over the planned budget' : undefined}
            tone={remaining !== null && remaining < 0 ? 'error' : 'default'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Budget used"
            value={formatPct(project.utilization_pct)}
            hint={project.utilization_pct === null ? 'No planned budget' : 'Spent as a share of planned'}
          />
        </Grid>
      </Grid>
      <SectionHeader
        title="Budget entries"
        subtitle="Each entry is actual spend; the project's spend is their sum."
        actions={createButton}
      />
      <DataTable
        ariaLabel="Budget entries"
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="No spend recorded yet"
        emptyMessage="Budget entries record actual spend by category and date."
        emptyAction={createButton}
        rowActions={
          canUpdate || canDelete
            ? (entry) => (
                <RowActions
                  name={`${CATEGORY_LABELS[entry.category] ?? entry.category} entry of ${formatDate(entry.entry_date)}`}
                  onEdit={canUpdate ? () => setDialog({ key: Date.now(), entry }) : undefined}
                  onDelete={canDelete ? () => removal.request(entry) : undefined}
                />
              )
            : undefined
        }
        pagination={{ total, page, rowsPerPage, onPageChange: setPage, onRowsPerPageChange: setRowsPerPage }}
      />
      {data && total > 0 ? (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1, display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="body2" component="p" sx={{ fontWeight: 600 }}>
            Total of {total} entr{total === 1 ? 'y' : 'ies'}: <MoneyText value={project.actual_spend} /> of{' '}
            <MoneyText value={project.planned_budget} /> planned ({formatPct(project.utilization_pct)})
          </Typography>
        </Paper>
      ) : null}
      {dialog ? (
        <BudgetEntryFormDialog
          key={dialog.key}
          open
          projectId={project.id}
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}
      <ConfirmDialog
        {...removal.dialogProps}
        title="Delete budget entry?"
        confirmLabel="Delete entry"
        message={
          removal.target ? (
            <>
              The {CATEGORY_LABELS[removal.target.category] ?? removal.target.category} entry of{' '}
              <MoneyText value={removal.target.amount} /> on {formatDate(removal.target.entry_date)} will be
              permanently deleted, and the project&apos;s spend will drop by that amount.
            </>
          ) : (
            ''
          )
        }
      />
    </Box>
  );
}

BudgetTab.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    planned_budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    actual_spend: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    remaining_budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    utilization_pct: PropTypes.number,
  }).isRequired,
  onChanged: PropTypes.func,
};

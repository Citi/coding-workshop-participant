import { useId } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import AddLinkIcon from '@mui/icons-material/AddLink';
import SectionHeader from './SectionHeader.jsx';
import { DEPENDENCY_FIELDS, dependencyPayload, validateDependency } from './entityForms.js';
import { useEntityForm } from './useEntityForm.js';
import { useNotify } from '../../notifications/useNotify.js';
import { createDependency } from '../../services/dependencies.js';

const EMPTY = Object.freeze({ predecessor_deliverable_id: '', successor_deliverable_id: '' });
const CYCLE = 'DEPENDENCY_CYCLE';

/**
 * Snackbar text for a rejected dependency.
 * @param {{error?: string}} error - ApiError from POST /dependencies.
 * @returns {string} Short summary; the form shows the full message.
 */
function failureSummary(error) {
  return error?.error === CYCLE
    ? 'Dependency rejected: it would create a cycle.'
    : 'The dependency was not added.';
}

/**
 * "Add dependency" form for the Dependencies tab (ADMIN, PM and LEAD). The successor waits
 * for the predecessor. A 400 DEPENDENCY_CYCLE rejection is shown in place with the server's
 * message, which spells out the whole loop by title (for example
 * "API Schema → Payments Service Integration → End-to-End Testing → API Schema"); it stays
 * until either select changes.
 * @param {object} props - Component props.
 * @param {Array<{value: string, label: string}>} props.deliverables - The project's deliverables.
 * @param {boolean} [props.loading] - Disable the form while the deliverables load.
 * @param {(dependency: object) => void} props.onAdded - Called with the created DependencyOut.
 * @returns {JSX.Element} The form.
 */
export default function AddDependencyForm({ deliverables, loading = false, onAdded }) {
  const headingId = useId();
  const notify = useNotify();
  const form = useEntityForm({
    initialValues: EMPTY,
    fields: DEPENDENCY_FIELDS,
    validate: validateDependency,
    submit: (values) => createDependency(dependencyPayload(values)),
    onSaved: (created) => {
      form.reset(EMPTY);
      notify.success(`Added: ${created.successor_title} now depends on ${created.predecessor_title}.`);
      onAdded(created);
    },
    failureMessage: failureSummary,
    clearSummaryOnChange: true,
  });
  const isCycle = form.submitError?.error === CYCLE;
  const disabled = form.submitting || loading;
  const tooFew = !loading && deliverables.length < 2;

  const selectProps = (name, helperText) => {
    const props = form.fieldProps(name, helperText);
    return {
      ...props,
      disabled: props.disabled || disabled || tooFew,
      helperText: isCycle && name === 'successor_deliverable_id' ? 'This pair would close a loop.' : props.helperText,
    };
  };

  return (
    <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2 }}>
      <SectionHeader
        id={headingId}
        title="Add dependency"
        subtitle="Choose the deliverable that must finish first and the one that waits for it."
      />
      <Box component="form" noValidate onSubmit={form.handleSubmit} aria-labelledby={headingId}>
        {form.formError ? (
          <Alert severity="error" role="alert" sx={{ mb: 2 }} data-testid="dependency-error">
            <AlertTitle>{isCycle ? 'Cycle detected: dependency not added' : 'Dependency not added'}</AlertTitle>
            {form.formError}
          </Alert>
        ) : null}
        {tooFew ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Add at least two deliverables to this project before linking them.
          </Alert>
        ) : null}
        <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Grid size={{ xs: 12, md: 'grow' }}>
            <TextField select label="Predecessor (finishes first)" {...selectProps('predecessor_deliverable_id')}>
              {deliverables.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 'grow' }}>
            <TextField select label="Successor (waits for it)" {...selectProps('successor_deliverable_id')}>
              {deliverables.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 'auto' }}>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={disabled || tooFew}
              startIcon={
                form.submitting ? <CircularProgress size={16} color="inherit" aria-hidden="true" /> : <AddLinkIcon />
              }
              sx={{ height: 56, whiteSpace: 'nowrap' }}
            >
              {form.submitting ? 'Adding…' : 'Add dependency'}
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  );
}

AddDependencyForm.propTypes = {
  deliverables: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  loading: PropTypes.bool,
  onAdded: PropTypes.func.isRequired,
};

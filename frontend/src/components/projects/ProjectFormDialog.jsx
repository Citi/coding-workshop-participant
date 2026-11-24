import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormDialog from './FormDialog.jsx';
import {
  LIMITS,
  PROJECT_FIELDS,
  emptyProjectValues,
  projectChanges,
  projectPayload,
  projectToValues,
  validateProject,
} from './entityForms.js';
import { currencySymbol } from './formUtils.js';
import { useEntityForm } from './useEntityForm.js';
import { useOptions } from './useOptions.js';
import { PROJECT_STATUSES, ROLE_LABELS, STATUS_LABELS } from '../../constants.js';
import { createProject, updateProject } from '../../services/projects.js';

const DATE_LABEL_PROPS = { inputLabel: { shrink: true } };

/**
 * Create or edit a project (ADMIN and PM). Validates before submitting, shows the API's field
 * errors next to the fields, disables the form while saving and sends only changed fields
 * when editing. Mount it with a fresh `key` each time it opens.
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the dialog is shown.
 * @param {object|null} [props.project] - ProjectOut to edit; null or omitted to create.
 * @param {() => void} props.onClose - Called when cancelled.
 * @param {(result: {project: object, changed: boolean}) => void} props.onSaved - Called after a
 *   successful save (or with `changed: false` when an edit changed nothing).
 * @returns {JSX.Element} The dialog.
 */
export default function ProjectFormDialog({ open, project = null, onClose, onSaved }) {
  const isEdit = Boolean(project);
  const options = useOptions({
    departments: true,
    users: true,
    current: project
      ? {
          department: { id: project.department_id, name: project.department_name },
          user: project.project_manager_id
            ? { id: project.project_manager_id, name: project.project_manager_name }
            : null,
        }
      : null,
  });
  const form = useEntityForm({
    initialValues: project ? projectToValues(project) : emptyProjectValues(),
    fields: PROJECT_FIELDS,
    validate: validateProject,
    submit: async (values) => {
      if (!isEdit) {
        return { project: await createProject(projectPayload(values)), changed: true };
      }
      const changes = projectChanges(values, project);
      if (Object.keys(changes).length === 0) {
        return { project, changed: false };
      }
      return { project: await updateProject(project.id, changes), changed: true };
    },
    onSaved,
    failureMessage: isEdit ? 'The project was not updated.' : 'The project was not created.',
  });
  const { fieldProps, submitting } = form;

  return (
    <FormDialog
      open={open}
      title={isEdit ? `Edit ${project.project_name}` : 'New project'}
      onSubmit={form.handleSubmit}
      onClose={onClose}
      submitting={submitting}
      submitLabel={isEdit ? 'Save changes' : 'Create project'}
      formError={form.formError}
    >
      {options.error ? (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={options.reload}>
              Retry
            </Button>
          }
        >
          The department and people lists could not be loaded.
        </Alert>
      ) : null}
      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField
            label="Project name"
            required
            autoFocus
            {...fieldProps('project_name')}
            slotProps={{ htmlInput: { maxLength: LIMITS.projectName } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Department" required {...fieldProps('department_id')}>
            {options.departments.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Project manager" {...fieldProps('project_manager_id', 'Optional')}>
            <MenuItem value="">
              <em>No manager</em>
            </MenuItem>
            {options.users.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.role ? `${option.label} (${ROLE_LABELS[option.role] ?? option.role})` : option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Status" required {...fieldProps('status')}>
            {PROJECT_STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Planned budget"
            required
            {...fieldProps('planned_budget', 'For example 150000 or 150000.50')}
            slotProps={{
              htmlInput: { inputMode: 'decimal' },
              input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField type="date" label="Start date" required {...fieldProps('start_date')} slotProps={DATE_LABEL_PROPS} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField type="date" label="End date" required {...fieldProps('end_date')} slotProps={DATE_LABEL_PROPS} />
        </Grid>
        <Grid size={12}>
          <TextField
            label="Description"
            multiline
            minRows={3}
            {...fieldProps('description', 'Optional')}
            slotProps={{ htmlInput: { maxLength: LIMITS.description } }}
          />
        </Grid>
      </Grid>
    </FormDialog>
  );
}

ProjectFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    project_name: PropTypes.string.isRequired,
    department_id: PropTypes.number,
    department_name: PropTypes.string,
    project_manager_id: PropTypes.number,
    project_manager_name: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

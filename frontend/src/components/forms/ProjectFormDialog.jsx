import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { MenuItem, Stack, TextField } from '@mui/material';
import FormDialog from '../FormDialog';
import useForm from '../../hooks/useForm';
import { api } from '../../services/api';
import { useAuth } from '../../services/AuthContext';
import { PROJECT_STATUS, todayIso } from '../../utils/format';
import {
  dateOrder, nonNegative, required,
} from '../../utils/validators';

const emptyProject = () => ({
  name: '', description: '', manager_id: '', start_date: todayIso(), estimated_end_date: '', budget: '', status: 'planned',
});

const toForm = (p) => ({
  name: p.name,
  description: p.description || '',
  manager_id: p.manager_id,
  start_date: p.start_date,
  estimated_end_date: p.estimated_end_date,
  budget: String(p.budget ?? ''),
  status: p.status,
});

/**
 * Create (admin) or edit (admin / project manager) a project.
 * Managers can change details, dates, budget and status but not the manager.
 */
export default function ProjectFormDialog({
  open, project = null, managers = [], onClose, onSaved,
}) {
  const { isAdmin } = useAuth();
  const isEdit = Boolean(project);
  const form = useForm(emptyProject(), (v) => ({
    name: required(v.name, 'Name'),
    manager_id: isAdmin ? required(v.manager_id, 'Manager') : undefined,
    start_date: required(v.start_date, 'Start date'),
    estimated_end_date: required(v.estimated_end_date, 'Estimated end date')
      || dateOrder(v.start_date, v.estimated_end_date, 'Estimated end date'),
    budget: nonNegative(v.budget),
  }));
  const { reset } = form;

  useEffect(() => {
    if (open) reset(project ? toForm(project) : emptyProject());
  }, [open, project, reset]);

  const handleSubmit = () => form.submit(async (v) => {
    const body = {
      name: v.name,
      description: v.description,
      start_date: v.start_date,
      estimated_end_date: v.estimated_end_date,
      budget: v.budget === '' ? 0 : Number(v.budget),
      status: v.status,
    };
    if (isAdmin) body.manager_id = Number(v.manager_id);
    const saved = isEdit ? await api.put(`/projects/${project.id}`, body) : await api.post('/projects', body);
    onSaved(saved);
  });

  const statuses = Object.entries(PROJECT_STATUS).filter(([key]) => isEdit || key !== 'completed');

  return (
    <FormDialog
      open={open}
      title={isEdit ? 'Edit project' : 'New project'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Save changes' : 'Create project'}
      submitting={form.submitting}
      formError={form.formError}
    >
      <TextField label="Project name" required autoFocus {...form.field('name')} />
      <TextField label="Description" multiline minRows={2} {...form.field('description')} />
      {isAdmin && (
        <TextField select label="Project manager" required {...form.field('manager_id')}>
          {managers.length === 0 && <MenuItem disabled value="">Add a manager on the People page first</MenuItem>}
          {managers.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
        </TextField>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Start date" type="date" required slotProps={{ inputLabel: { shrink: true } }} {...form.field('start_date')} />
        <TextField label="Estimated end date" type="date" required slotProps={{ inputLabel: { shrink: true } }} {...form.field('estimated_end_date')} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Budget (USD)" type="number" slotProps={{ htmlInput: { min: 0, step: 100 } }} {...form.field('budget')} />
        <TextField select label="Status" {...form.field('status')}>
          {statuses.map(([key, s]) => <MenuItem key={key} value={key}>{s.label}</MenuItem>)}
        </TextField>
      </Stack>
    </FormDialog>
  );
}

ProjectFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  project: PropTypes.object,
  managers: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

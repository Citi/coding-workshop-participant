import { useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Checkbox, ListItemText, MenuItem, Stack, TextField,
} from '@mui/material';
import FormDialog from '../FormDialog';
import useForm from '../../hooks/useForm';
import { api } from '../../services/api';
import { formatMoney, MILESTONE_STATUS } from '../../utils/format';
import { dateOrder, nonNegative, required } from '../../utils/validators';

/**
 * Create or edit a milestone: dates, budget, status and assigned people.
 * Only people already on the project can be assigned.
 */
export default function MilestoneFormDialog({
  open, project, milestone = null, onClose, onSaved,
}) {
  const isEdit = Boolean(milestone);
  const form = useForm({}, (v) => ({
    name: required(v.name, 'Name'),
    start_date: required(v.start_date, 'Start date')
      || (v.start_date < project.start_date ? 'Must be on or after the project start date.' : undefined),
    end_date: required(v.end_date, 'End date') || dateOrder(v.start_date, v.end_date),
    budget: nonNegative(v.budget),
  }));
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset(milestone ? {
      name: milestone.name,
      description: milestone.description || '',
      start_date: milestone.start_date,
      end_date: milestone.end_date,
      budget: String(milestone.budget ?? ''),
      status: milestone.status,
      user_ids: milestone.members.map((m) => m.id),
    } : {
      name: '', description: '', start_date: project.start_date, end_date: '', budget: '', status: 'not_started', user_ids: [],
    });
  }, [open, milestone, project, reset]);

  const handleSubmit = () => form.submit(async (v) => {
    const body = {
      name: v.name,
      description: v.description,
      start_date: v.start_date,
      end_date: v.end_date,
      budget: v.budget === '' ? 0 : Number(v.budget),
      status: v.status,
      user_ids: v.user_ids,
    };
    const saved = isEdit
      ? await api.put(`/milestones/${milestone.id}`, body)
      : await api.post(`/projects/${project.id}/milestones`, body);
    onSaved(saved);
  });

  const available = Number(project.budget) - Number(project.budget_allocated) + Number(milestone?.budget || 0);
  const memberName = (id) => project.members.find((m) => m.id === id)?.name || `#${id}`;

  return (
    <FormDialog
      open={open}
      title={isEdit ? 'Edit milestone' : 'New milestone'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Save changes' : 'Add milestone'}
      submitting={form.submitting}
      formError={form.formError}
    >
      <TextField label="Milestone name" required autoFocus {...form.field('name')} />
      <TextField label="What happens at this milestone" multiline minRows={2} {...form.field('description')} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Start date" type="date" required slotProps={{ inputLabel: { shrink: true } }} {...form.field('start_date')} />
        <TextField label="End date" type="date" required slotProps={{ inputLabel: { shrink: true } }} {...form.field('end_date')} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Budget (USD)"
          type="number"
          slotProps={{ htmlInput: { min: 0, step: 100 } }}
          {...form.field('budget')}
          helperText={form.errors.budget || `${formatMoney(available)} of the project budget is available.`}
        />
        <TextField select label="Status" {...form.field('status')}>
          {Object.entries(MILESTONE_STATUS).map(([key, s]) => <MenuItem key={key} value={key}>{s.label}</MenuItem>)}
        </TextField>
      </Stack>
      <TextField
        select
        label="People on this milestone"
        value={form.values.user_ids || []}
        onChange={(e) => form.setField('user_ids', e.target.value)}
        error={Boolean(form.errors.user_ids)}
        helperText={form.errors.user_ids || (project.members.length ? 'Choose from people on the project.' : 'Assign people to the project first.')}
        slotProps={{ select: { multiple: true, renderValue: (ids) => ids.map(memberName).join(', ') } }}
      >
        {project.members.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            <Checkbox checked={(form.values.user_ids || []).includes(m.id)} />
            <ListItemText primary={m.name} secondary={m.job_title} />
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}

MilestoneFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    start_date: PropTypes.string.isRequired,
    budget: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    budget_allocated: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    members: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  milestone: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

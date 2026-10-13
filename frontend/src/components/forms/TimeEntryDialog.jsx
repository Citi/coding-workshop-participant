import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import FormDialog from '../FormDialog';
import useForm from '../../hooks/useForm';
import { api } from '../../services/api';
import { useAuth } from '../../services/AuthContext';
import { SHOW_EMPTY_OPTION, todayIso } from '../../utils/format';
import { hours, required } from '../../utils/validators';

const QUICK_HOURS = [2, 4, 6, 8];

/**
 * Log or correct hours. A full day is 8 hours, so that is the default.
 * Managers/admins may log for anyone on a project they run; employees log their own time.
 *
 * @param {object} props
 * @param {Array} props.projects Projects the user can log against (with members/milestones when known).
 * @param {object} [props.entry] Existing entry to edit.
 * @param {number} [props.projectId] Pre-selected project.
 */
export default function TimeEntryDialog({
  open, projects, entry = null, projectId = null, onClose, onSaved,
}) {
  const { user } = useAuth();
  const isEdit = Boolean(entry);
  const [loaded, setLoaded] = useState({ id: null, data: null });
  const form = useForm({}, (v) => ({
    project_id: required(v.project_id, 'Project'),
    work_date: required(v.work_date, 'Date') || (v.work_date > todayIso() ? 'You cannot log time in the future.' : undefined),
    hours: hours(v.hours),
  }));
  const { reset, values } = form;

  useEffect(() => {
    if (!open) return;
    reset(entry ? {
      project_id: entry.project_id,
      user_id: entry.user_id,
      milestone_id: entry.milestone_id ?? '',
      work_date: entry.work_date,
      hours: String(entry.hours),
      note: entry.note || '',
    } : {
      project_id: projectId ?? (projects.length === 1 ? projects[0].id : ''),
      user_id: user.id,
      milestone_id: '',
      work_date: todayIso(),
      hours: '8',
      note: '',
    });
  }, [open, entry, projectId, projects, user.id, reset]);

  // Load members + milestones for the chosen project.
  useEffect(() => {
    if (!open || !values.project_id) return undefined;
    let active = true;
    const id = values.project_id;
    api.get(`/projects/${id}`)
      .then((p) => active && setLoaded({ id, data: p }))
      .catch(() => active && setLoaded({ id, data: null }));
    return () => {
      active = false;
    };
  }, [open, values.project_id]);
  const detail = values.project_id && loaded.id === values.project_id ? loaded.data : null;

  const canLogForOthers = Boolean(detail?.can_manage);
  const people = useMemo(() => (detail?.members || []), [detail]);

  const handleSubmit = () => form.submit(async (v) => {
    const body = {
      work_date: v.work_date,
      hours: Number(v.hours),
      note: v.note,
      milestone_id: v.milestone_id === '' ? null : Number(v.milestone_id),
    };
    let saved;
    if (isEdit) {
      saved = await api.put(`/time-entries/${entry.id}`, body);
    } else {
      saved = await api.post('/time-entries', {
        ...body,
        project_id: Number(v.project_id),
        user_id: Number(v.user_id || user.id),
      });
    }
    onSaved(saved);
  });

  return (
    <FormDialog
      open={open}
      title={isEdit ? 'Edit time entry' : 'Log time'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Save changes' : 'Log time'}
      submitting={form.submitting}
      formError={form.formError}
    >
      <TextField
        select
        label="Project"
        required
        disabled={isEdit || Boolean(projectId)}
        {...form.field('project_id')}
        onChange={(e) => form.setValues((s) => ({
          ...s, project_id: e.target.value, milestone_id: '', user_id: user.id,
        }))}
      >
        {projects.length === 0 && <MenuItem disabled value="">You are not assigned to any projects yet</MenuItem>}
        {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
      </TextField>

      {canLogForOthers && !isEdit && (
        <TextField select label="Person" {...form.field('user_id')}>
          {people.length === 0 && <MenuItem disabled value={user.id}>No one is assigned to this project yet</MenuItem>}
          {people.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
        </TextField>
      )}

      <TextField select label="Milestone (optional)" slotProps={SHOW_EMPTY_OPTION} {...form.field('milestone_id')}>
        <MenuItem value="">General project work</MenuItem>
        {(detail?.milestones || []).map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
      </TextField>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
        <TextField
          label="Date"
          type="date"
          required
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIso() } }}
          {...form.field('work_date')}
        />
        <TextField
          label="Hours"
          type="number"
          required
          slotProps={{ htmlInput: { min: 0.25, max: 24, step: 0.25 } }}
          {...form.field('hours')}
          helperText={form.errors.hours || 'A full working day is 8 hours.'}
        />
      </Stack>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={Number(values.hours)}
        onChange={(_, v) => v && form.setField('hours', String(v))}
        aria-label="Quick hours"
      >
        {QUICK_HOURS.map((h) => (
          <ToggleButton key={h} value={h} sx={{ px: 2 }}>{h === 8 ? 'Full day' : `${h} h`}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      <TextField label="What did you work on?" multiline minRows={2} {...form.field('note')} />
    </FormDialog>
  );
}

TimeEntryDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  projects: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })).isRequired,
  entry: PropTypes.object,
  projectId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

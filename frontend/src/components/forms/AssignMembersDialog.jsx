import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Button, Checkbox, List, ListItem, ListItemButton, ListItemIcon, ListItemText, TextField, Typography,
} from '@mui/material';
import FormDialog from '../FormDialog';
import { api } from '../../services/api';

/**
 * Pick employees to add to a project. The project manager's own team is
 * listed first with a one-click "select whole team"; people from other teams
 * can also be onboarded (they keep their current manager).
 * Mount it only while open so each opening starts with a clean selection.
 */
export default function AssignMembersDialog({
  open, project, employees, onClose, onSaved,
}) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const assigned = useMemo(() => new Set(project.members.map((m) => m.id)), [project.members]);
  const candidates = employees.filter((e) => !assigned.has(e.id)
    && `${e.name} ${e.job_title} ${e.manager_name || ''}`.toLowerCase().includes(search.toLowerCase()));
  const team = candidates.filter((e) => e.manager_id === project.manager_id);
  const others = candidates.filter((e) => e.manager_id !== project.manager_id);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const handleSubmit = async () => {
    if (!selected.length) {
      setError('Select at least one person.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const members = await api.post(`/projects/${project.id}/members`, { user_ids: selected });
      onSaved(members, selected.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderGroup = (title, people, hint) => (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="h4" component="h3">{title}</Typography>
        {people.length > 1 && title === `${project.manager_name}'s team` && (
          <Button size="small" onClick={() => setSelected((s) => [...new Set([...s, ...people.map((p) => p.id)])])}>
            Select whole team
          </Button>
        )}
      </Box>
      {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
      {people.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No one else to add.</Typography>
      ) : (
        <List dense disablePadding>
          {people.map((e) => (
            <ListItem key={e.id} disablePadding>
              <ListItemButton onClick={() => toggle(e.id)}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox edge="start" checked={selected.includes(e.id)} tabIndex={-1} inputProps={{ 'aria-label': e.name }} />
                </ListItemIcon>
                <ListItemText
                  primary={e.name}
                  secondary={[e.job_title, e.manager_name ? `reports to ${e.manager_name}` : 'no manager'].filter(Boolean).join(', ')}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );

  return (
    <FormDialog
      open={open}
      title={`Add people to ${project.name}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={selected.length ? `Add ${selected.length} ${selected.length === 1 ? 'person' : 'people'}` : 'Add people'}
      submitting={submitting}
      formError={error}
    >
      <TextField label="Search by name, title or manager" value={search} onChange={(e) => setSearch(e.target.value)} />
      {renderGroup(`${project.manager_name}'s team`, team)}
      {renderGroup('Other teams', others, 'They join this project but stay on their current team. Only an admin can move someone to a different team.')}
    </FormDialog>
  );
}

AssignMembersDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    manager_id: PropTypes.number.isRequired,
    manager_name: PropTypes.string,
    members: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  employees: PropTypes.arrayOf(PropTypes.object).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

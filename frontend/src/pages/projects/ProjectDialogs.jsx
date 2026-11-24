import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import { useNotify } from '../../context/notificationContext'
import { projectsApi } from '../../services/projectsApi'
import { deleteProjectMessage, newProjectValues, PROJECT_FIELDS, toProjectPayload } from './projectFields'

/**
 * Create / edit / delete dialogs for projects, shared by the list and detail pages.
 * dialog: null | { mode: 'create' } | { mode: 'edit' | 'delete', project }
 * onSaved(project) after a create or update, onDeleted(project) after a delete (dialog already closed).
 */
export default function ProjectDialogs({ dialog, onClose, onSaved, onDeleted }) {
  const notify = useNotify()
  const mode = dialog?.mode
  const project = dialog?.project
  const editing = mode === 'edit'

  const save = async (values) => {
    const payload = toProjectPayload(values)
    const saved = editing ? await projectsApi.update(project.id, payload) : await projectsApi.create(payload)
    notify.success(editing ? 'Project updated' : 'Project created')
    onClose()
    onSaved?.(saved)
  }

  const remove = async () => {
    await projectsApi.remove(project.id)
    notify.success('Project deleted')
    onClose()
    onDeleted?.(project)
  }

  return (
    <>
      <FormDialog
        open={mode === 'create' || editing}
        onClose={onClose}
        title={editing ? 'Edit project' : 'New project'}
        fields={PROJECT_FIELDS}
        initialValues={editing ? project : newProjectValues()}
        submitLabel={editing ? 'Save changes' : 'Create project'}
        onSubmit={save}
      />
      <ConfirmDialog
        open={mode === 'delete'}
        onClose={onClose}
        title="Delete project?"
        message={project ? deleteProjectMessage(project) : ''}
        confirmLabel="Delete project"
        onConfirm={remove}
      />
    </>
  )
}

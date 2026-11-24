import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import { useNotify } from '../../context/notificationContext'
import { resourcesApi } from '../../services/resourcesApi'
import { deleteResourceMessage, RESOURCE_FIELDS, toResourcePayload } from './resourceFields'

/**
 * Create / edit / delete dialogs for resources (team members), shared by the list and detail pages.
 * dialog: null | { mode: 'create' } | { mode: 'edit' | 'delete', resource }
 * onSaved(resource) after a create or update, onDeleted(resource) after a delete (dialog already closed).
 */
export default function ResourceDialogs({ dialog, onClose, onSaved, onDeleted }) {
  const notify = useNotify()
  const mode = dialog?.mode
  const resource = dialog?.resource
  const editing = mode === 'edit'

  const save = async (values) => {
    const payload = toResourcePayload(values)
    const saved = editing ? await resourcesApi.update(resource.id, payload) : await resourcesApi.create(payload)
    notify.success(editing ? 'Resource updated' : 'Resource created')
    onClose()
    onSaved?.(saved)
  }

  const remove = async () => {
    await resourcesApi.remove(resource.id)
    notify.success('Resource deleted')
    onClose()
    onDeleted?.(resource)
  }

  return (
    <>
      <FormDialog
        open={mode === 'create' || editing}
        onClose={onClose}
        title={editing ? 'Edit resource' : 'New resource'}
        description={editing ? undefined : 'Add a team member so they can be allocated to projects and own deliverables.'}
        fields={RESOURCE_FIELDS}
        initialValues={editing ? resource : undefined}
        submitLabel={editing ? 'Save changes' : 'Create resource'}
        onSubmit={save}
      />
      <ConfirmDialog
        open={mode === 'delete'}
        onClose={onClose}
        title="Delete resource?"
        message={resource ? deleteResourceMessage(resource) : ''}
        confirmLabel="Delete resource"
        onConfirm={remove}
      />
    </>
  )
}

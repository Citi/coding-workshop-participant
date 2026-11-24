import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import { useNotify } from '../../context/notificationContext'
import { usersApi } from '../../services/usersApi'
import { deleteUserMessage, NEW_USER_VALUES, toUserPayload, userFields } from './userFields'

const SELF_NOTE = 'This is your own account: you can change your name, email and password, but not your own role or status.'

/**
 * Create / edit / delete dialogs for user accounts.
 * dialog: null | { mode: 'create' } | { mode: 'edit' | 'delete', user }
 * currentUserId: the logged-in admin (their own role and status are locked in the form).
 * onSaved() runs after a successful create, update or delete (the dialog is already closed).
 */
export default function UserDialogs({ dialog, currentUserId, onClose, onSaved }) {
  const notify = useNotify()
  const mode = dialog?.mode
  const user = dialog?.user
  const editing = mode === 'edit'
  const isSelf = Boolean(user) && user.id === currentUserId

  const save = async (values) => {
    const payload = toUserPayload(values, { editing })
    if (editing) await usersApi.update(user.id, payload)
    else await usersApi.create(payload)
    notify.success(editing ? 'User updated' : 'User created')
    onClose()
    onSaved()
  }

  const remove = async () => {
    await usersApi.remove(user.id)
    notify.success('User deleted')
    onClose()
    onSaved()
  }

  return (
    <>
      <FormDialog
        open={mode === 'create' || editing}
        onClose={onClose}
        title={editing ? 'Edit user' : 'New user'}
        description={editing && isSelf ? SELF_NOTE : undefined}
        fields={userFields({ editing, isSelf })}
        initialValues={editing ? user : NEW_USER_VALUES}
        submitLabel={editing ? 'Save changes' : 'Create user'}
        onSubmit={save}
      />
      <ConfirmDialog
        open={mode === 'delete'}
        onClose={onClose}
        title="Delete user?"
        message={user ? deleteUserMessage(user) : ''}
        confirmLabel="Delete user"
        onConfirm={remove}
      />
    </>
  )
}

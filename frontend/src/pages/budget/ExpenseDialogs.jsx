import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import { useNotify } from '../../context/notificationContext'
import { expensesApi } from '../../services/expensesApi'
import { deleteExpenseMessage, expenseFields, newExpenseValues, toExpensePayload } from './expenseFields'
import { includeOption } from '../../utils/options'

/**
 * Create / edit / delete dialogs for expenses.
 * dialog: null | { mode: 'create' } | { mode: 'edit' | 'delete', expense }
 * projectOptions: [{ value, label }] for the project select.
 * fixedProjectId (+ fixedProjectName): the form's project is locked to it; defaultProjectId preselects one.
 * onSaved() runs after a successful create, update or delete (the dialog is already closed).
 */
export default function ExpenseDialogs({ dialog, onClose, onSaved, projectOptions, fixedProjectId, fixedProjectName, defaultProjectId }) {
  const notify = useNotify()
  const mode = dialog?.mode
  const expense = dialog?.expense
  const editing = mode === 'edit'

  const save = async (values) => {
    const payload = toExpensePayload(values)
    if (editing) await expensesApi.update(expense.id, payload)
    else await expensesApi.create(payload)
    notify.success(editing ? 'Expense updated' : 'Expense created')
    onClose()
    onSaved()
  }

  const remove = async () => {
    await expensesApi.remove(expense.id)
    notify.success('Expense deleted')
    onClose()
    onSaved()
  }

  // The current project is always selectable, even before the project list has loaded.
  const options = fixedProjectId
    ? includeOption(projectOptions, fixedProjectId, fixedProjectName || 'This project')
    : includeOption(projectOptions, expense?.project_id, expense?.project_name)

  return (
    <>
      <FormDialog
        open={mode === 'create' || editing}
        onClose={onClose}
        title={editing ? 'Edit expense' : 'New expense'}
        fields={expenseFields({ projectOptions: options, fixedProject: Boolean(fixedProjectId) })}
        initialValues={editing ? expense : newExpenseValues(fixedProjectId ?? defaultProjectId)}
        submitLabel={editing ? 'Save changes' : 'Create expense'}
        onSubmit={save}
      />
      <ConfirmDialog
        open={mode === 'delete'}
        onClose={onClose}
        title="Delete expense?"
        message={expense ? deleteExpenseMessage(expense) : ''}
        confirmLabel="Delete expense"
        onConfirm={remove}
      />
    </>
  )
}

/**
 * Confirm-then-delete flow shared by the project pages (spec 12.4: a confirm dialog before
 * every delete, and a snackbar for success and failure).
 */
import { useCallback, useRef, useState } from 'react';
import { useNotify } from '../../notifications/useNotify.js';

/**
 * Track which record is waiting for confirmation and run the delete once confirmed.
 *
 * @example
 * const removal = useConfirmDelete({ remove: (p) => deleteProject(p.id),
 *   successMessage: (p) => `Deleted ${p.project_name}.`, onDeleted: reload });
 * <IconButton onClick={() => removal.request(project)} />
 * <ConfirmDialog {...removal.dialogProps} title="Delete project?" message={...} />
 *
 * @param {object} options - Flow options.
 * @param {(target: object) => Promise<unknown>} options.remove - Sends the DELETE request.
 * @param {(target: object) => string} options.successMessage - Snackbar text after deleting.
 * @param {string} [options.failureMessage] - Snackbar fallback when the error has no message.
 * @param {(target: object) => void} [options.onDeleted] - Called after a successful delete.
 * @param {(target: object, error: Error) => void} [options.onFailed] - Called after a failure.
 * @returns {{target: object|null, request: (target: object) => void,
 *   dialogProps: {open: boolean, loading: boolean, onConfirm: () => Promise<void>, onCancel: () => void}}}
 *   The pending target, a function to ask for confirmation and props for ConfirmDialog.
 */
export function useConfirmDelete({ remove, successMessage, failureMessage, onDeleted, onFailed }) {
  const notify = useNotify();
  const busy = useRef(false);
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const request = useCallback((item) => setTarget(item), []);
  const cancel = useCallback(() => {
    if (!busy.current) {
      setTarget(null);
    }
  }, []);

  const confirm = async () => {
    if (!target || busy.current) {
      return;
    }
    const item = target;
    busy.current = true;
    setDeleting(true);
    try {
      await remove(item);
    } catch (error) {
      busy.current = false;
      setDeleting(false);
      setTarget(null);
      notify.error(error, failureMessage || 'The record was not deleted. Please try again.');
      if (onFailed) {
        onFailed(item, error);
      }
      return;
    }
    busy.current = false;
    setDeleting(false);
    setTarget(null);
    notify.success(successMessage(item));
    if (onDeleted) {
      onDeleted(item);
    }
  };

  return {
    target,
    request,
    dialogProps: { open: Boolean(target), loading: deleting, onConfirm: confirm, onCancel: cancel },
  };
}

export default useConfirmDelete;

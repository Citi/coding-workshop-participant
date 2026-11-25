import { useCallback, useMemo } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormDialog from '../../components/FormDialog'
import { ErrorState, LoadingState } from '../../components/StateViews'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useIsMobile } from '../../hooks/useIsMobile'
import { deliverablesApi } from '../../services/deliverablesApi'
import { projectsApi } from '../../services/projectsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { deliverableFields, initialDeliverableValues } from './deliverableFields'

async function loadFormOptions() {
  const [projects, resources, deliverables] = await Promise.all([projectsApi.list(), resourcesApi.list(), deliverablesApi.list()])
  return { projects: projects.items, resources: resources.items, deliverables: deliverables.items }
}

/**
 * Create/edit form for a deliverable. Its select options (projects, people and every other
 * deliverable for the dependency picker) are loaded each time it opens, so they are never stale.
 * Props: { open, deliverable? (edit), projectId? (locks the project), defaultProjectId?, onClose, onSubmit(payload) }
 */
export default function DeliverableFormDialog({ open, deliverable, projectId, defaultProjectId, onClose, onSubmit }) {
  const isMobile = useIsMobile()
  const fetchOptions = useCallback(() => (open ? loadFormOptions() : Promise.resolve(null)), [open])
  const { data: options, error, reload } = useApiQuery(fetchOptions)
  const ready = open && Boolean(options)
  const title = deliverable ? 'Edit deliverable' : 'New deliverable'
  const fields = useMemo(
    () => (options ? deliverableFields(options, { deliverable, fixedProject: Boolean(projectId) }) : []),
    [options, deliverable, projectId],
  )
  // Preselect the project the list is filtered by, if it still exists.
  const suggestedProjectId = options?.projects.some((project) => project.id === defaultProjectId) ? defaultProjectId : undefined

  return (
    <>
      <Dialog
        open={open && !ready}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        aria-labelledby="deliverable-form-loading-title"
      >
        <DialogTitle id="deliverable-form-loading-title">{title}</DialogTitle>
        <DialogContent dividers>
          {error ? <ErrorState error={error} onRetry={reload} title="Could not load the form" /> : <LoadingState label="Loading form…" />}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
      <FormDialog
        open={ready}
        title={title}
        fields={fields}
        initialValues={initialDeliverableValues(deliverable, projectId ?? suggestedProjectId)}
        submitLabel={deliverable ? 'Save changes' : 'Create deliverable'}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </>
  )
}

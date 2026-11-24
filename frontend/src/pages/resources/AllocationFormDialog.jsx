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
import { projectsApi } from '../../services/projectsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { allocationFields, allocationFormDescription, initialAllocationValues } from './allocationFields'

async function loadFormOptions() {
  const [resources, projects] = await Promise.all([resourcesApi.list(), projectsApi.list()])
  return { resources: resources.items, projects: projects.items }
}

/**
 * Create/edit form for an allocation. The people and projects to pick from are loaded each time
 * it opens, so totals and names are never stale.
 * Props: { open, allocation? (edit), resourceId?, projectId? (lock that select), existing (listed
 *          allocations, to leave out people/projects already paired), onClose, onSubmit(payload) }
 */
export default function AllocationFormDialog({ open, allocation, resourceId, projectId, existing, onClose, onSubmit }) {
  const isMobile = useIsMobile()
  const fetchOptions = useCallback(() => (open ? loadFormOptions() : Promise.resolve(null)), [open])
  const { data: options, error, reload } = useApiQuery(fetchOptions)
  const ready = open && Boolean(options)
  const title = allocation ? 'Edit allocation' : 'New allocation'
  const fields = useMemo(
    () => (options ? allocationFields(options, { allocation, resourceId, projectId, existing }) : []),
    [options, allocation, resourceId, projectId, existing],
  )

  return (
    <>
      <Dialog
        open={open && !ready}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        aria-labelledby="allocation-form-loading-title"
      >
        <DialogTitle id="allocation-form-loading-title">{title}</DialogTitle>
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
        description={allocationFormDescription({ resourceId, projectId })}
        fields={fields}
        initialValues={initialAllocationValues(allocation, { resourceId, projectId })}
        submitLabel={allocation ? 'Save changes' : 'Create allocation'}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </>
  )
}

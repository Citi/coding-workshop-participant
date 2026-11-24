import { useCallback, useMemo } from 'react'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import FormDialog from '../../components/FormDialog'
import { ErrorState, LoadingState } from '../../components/StateViews'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useIsMobile } from '../../hooks/useIsMobile'
import { projectsApi } from '../../services/projectsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { formatPercent } from '../../utils/format'
import { labelFor } from '../../utils/labels'
import { isBlank } from '../../utils/validators'
import { allocationFields, allocationFormDescription, initialAllocationValues } from './allocationFields'
import { FULL_TIME_PERCENT } from './resourceUtils'

async function loadFormOptions() {
  const [resources, projects] = await Promise.all([resourcesApi.list(), projectsApi.list()])
  return { resources: resources.items, projects: projects.items }
}

/**
 * Create/edit form for an allocation. The people and projects to pick from are loaded each time
 * it opens, so totals and names are never stale. Under the fields, a live what-if shows the
 * person's total before and after saving (see AllocationWhatIf).
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
        // Shown under the fields with the values entered so far, re-rendered on every change.
        renderAfterFields={(values) => (
          <AllocationWhatIf
            resources={options?.resources}
            projects={options?.projects}
            allocation={allocation}
            resourceId={values.resource_id}
            projectId={values.project_id}
            percent={values.allocation_percent}
          />
        )}
      />
    </>
  )
}

const ACTIVE = 'active'

/** Ids arrive as numbers (API, route) or as select values; '' / null / undefined mean "not chosen". */
const sameId = (id, other) => !isBlank(id) && String(id) === String(other)
const findById = (records = [], id) => records.find((record) => sameId(id, record.id))

/** The percentage the form would save (a whole number from 1 to 100, like the API accepts), else null. */
function percentToSave(value) {
  if (isBlank(value)) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 100 ? number : null
}

/**
 * The person's total before and after saving, by the API's rule: only allocations to ACTIVE projects
 * count, and above 100% a person is over-allocated (exactly 100% is fine). Null until a person, a
 * project and a valid percentage are chosen.
 *   now   = total_allocation_percent from GET /resources (loaded when the form opened)
 *   after = now - the allocation being edited (when it is this person's and its project is active,
 *           it is already part of "now") + the new percentage (when the chosen project is active)
 */
function allocationWhatIf({ resources, projects, allocation, resourceId, projectId, percent }) {
  const resource = findById(resources, resourceId)
  const project = findById(projects, projectId)
  const newPercent = percentToSave(percent)
  if (!resource || !project || newPercent === null) return null

  const current = resource.total_allocation_percent ?? 0
  const originalStatus = allocation && (findById(projects, allocation.project_id)?.status ?? allocation.project_status)
  const alreadyCounted =
    allocation && sameId(allocation.resource_id, resource.id) && originalStatus === ACTIVE ? Number(allocation.allocation_percent) || 0 : 0
  const counts = project.status === ACTIVE
  const projected = current - alreadyCounted + (counts ? newPercent : 0)
  return { name: resource.full_name, project, counts, current, projected, overAllocated: projected > FULL_TIME_PERCENT }
}

/** How long the user has to pause (typing a percentage, picking a person) before the what-if is announced. */
export const ANNOUNCE_DELAY_MS = 500

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** Why the chosen project does not change the load (it is not active), or null when it counts. */
function notCountedText({ name, project, counts }) {
  if (counts) return null
  return (
    `${project.name} is ${labelFor('project', project.status).toLowerCase()}, so this allocation does not count toward ` +
    `${name}'s load (only active projects do).`
  )
}

/** The verdict line: "Within capacity", or over-allocated ("Still …" when the person already is). */
function capacityText({ current, overAllocated }) {
  if (!overAllocated) return 'Within capacity'
  const when = current > FULL_TIME_PERCENT ? 'Still' : 'Will be'
  return `${when} over-allocated – more than ${FULL_TIME_PERCENT}% across active projects`
}

/** The what-if as one sentence-by-sentence message for screen readers (no "→", which reads as "right arrow"). */
function whatIfMessage(whatIf) {
  return [
    `${whatIf.name}: ${formatPercent(whatIf.current)} now, ${formatPercent(whatIf.projected)} after this change.`,
    notCountedText(whatIf),
    `${capacityText(whatIf)}.`,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Live what-if under the allocation form: "Priya Shah: 60% now → 110% after this change", with a
 * warning when the result is over-allocated ("Still over-allocated" when the person already is)
 * or "Within capacity" otherwise, and a note when the chosen project is not active (it does not
 * count toward the person's load). A heads-up only: saving is never blocked, as the API allows
 * over-allocation.
 * The preview follows every keystroke. Screen readers get the same facts in words from a polite
 * status message that is updated once the user pauses (ANNOUNCE_DELAY_MS), so typing "100" is
 * announced once, not after each digit; the visual preview is hidden from them to avoid reading
 * it twice. The status message always exists (empty until there is a what-if), so changes are
 * announced.
 * Props: { resources, projects } (the form's loaded options), allocation? (the one being edited),
 *        resourceId, projectId, percent (the form values entered so far)
 */
export function AllocationWhatIf(props) {
  const whatIf = allocationWhatIf(props)
  const announcement = useDebouncedValue(whatIf ? whatIfMessage(whatIf) : '', ANNOUNCE_DELAY_MS)
  return (
    <>
      {whatIf && <WhatIfSummary {...whatIf} />}
      <Box role="status" aria-live="polite" aria-atomic="true" sx={VISUALLY_HIDDEN}>
        {announcement}
      </Box>
    </>
  )
}

function WhatIfSummary(whatIf) {
  const { name, current, projected, overAllocated } = whatIf
  const note = notCountedText(whatIf)
  // Text on the dialog's white background: warning.main and text.secondary both pass 4.5:1.
  return (
    <Box
      aria-hidden="true"
      data-testid="allocation-what-if"
      sx={{ mt: 2, p: 1.5, border: 1, borderColor: overAllocated ? 'warning.main' : 'divider', borderRadius: 1, overflowWrap: 'anywhere' }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {`${name}: ${formatPercent(current)} now → ${formatPercent(projected)} after this change`}
      </Typography>
      {note && (
        <Typography variant="body2" color="textSecondary">
          {note}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 0.5, color: overAllocated ? 'warning.main' : 'text.secondary' }}>
        {overAllocated ? <WarningAmberIcon fontSize="small" /> : <CheckCircleOutlinedIcon fontSize="small" />}
        <Typography variant="body2" sx={{ fontWeight: overAllocated ? 600 : undefined }}>
          {capacityText(whatIf)}
        </Typography>
      </Box>
    </Box>
  )
}

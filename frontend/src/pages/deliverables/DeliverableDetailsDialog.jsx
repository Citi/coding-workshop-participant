import { useCallback, useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import DueDate from '../../components/DueDate'
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews'
import StatusChip from '../../components/StatusChip'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useIsMobile } from '../../hooks/useIsMobile'
import { deliverablesApi } from '../../services/deliverablesApi'
import { KeyBadge } from './DeliverableBits'
import DependencyList from './DependencyList'
import { isBlocker, sortChain } from './deliverableUtils'
import { countLabel } from '../../utils/text'

/**
 * One deliverable in detail: facts, description, direct prerequisites, the full upstream
 * dependency chain (blockers highlighted) and the deliverables it blocks. Related deliverables
 * open in place and "Back" returns along the path taken.
 * Props: { open, deliverable: the clicked row ({ id, name, ... }), onClose }
 */
export default function DeliverableDetailsDialog({ open, deliverable, onClose }) {
  const isMobile = useIsMobile()
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobile} aria-labelledby="deliverable-details-title">
      {open && deliverable && <DetailsBody key={deliverable.id} start={deliverable} onClose={onClose} />}
    </Dialog>
  )
}

function DetailsBody({ start, onClose }) {
  const [trail, setTrail] = useState(() => [{ id: start.id, name: start.name }])
  const current = trail[trail.length - 1]
  const previous = trail.length > 1 ? trail[trail.length - 2] : null
  const fetchDetails = useCallback(() => deliverablesApi.get(current.id), [current.id])
  const { data, error, reload } = useApiQuery(fetchDetails)
  // useApiQuery keeps the previous record while the next one loads; only show the one asked for.
  const details = data?.id === current.id ? data : null

  const openRelated = (item) => setTrail((path) => [...path, { id: item.id, name: item.name }])
  const goBack = () => setTrail((path) => path.slice(0, -1))

  let content = <LoadingState label="Loading deliverable…" />
  if (details) content = <DetailsContent details={details} onOpen={openRelated} onLeave={onClose} />
  // Deleted meanwhile (e.g. by someone else): retrying cannot bring it back, so there is no Retry.
  else if (error?.status === 404) content = <EmptyState title="Deliverable not found" message="This deliverable does not exist or has been deleted." />
  else if (error) content = <ErrorState error={error} onRetry={reload} title="Could not load the deliverable" />

  return (
    <>
      <DialogTitle id="deliverable-details-title" sx={{ pr: 7 }}>
        {details?.name ?? current.name}
      </DialogTitle>
      <IconButton aria-label="Close details" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
        <CloseIcon />
      </IconButton>
      <DialogContent dividers>{content}</DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1 }}>
        {previous && (
          <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ mr: 'auto' }}>
            Back to {previous.name}
          </Button>
        )}
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </>
  )
}

function DetailsContent({ details, onOpen, onLeave }) {
  const dependsOn = details.depends_on || []
  const chain = sortChain(details.dependency_chain || [])
  const blocks = details.blocks || []
  return (
    <Stack spacing={3}>
      {details.is_key && (
        <Box>
          <KeyBadge label="Key deliverable" />
        </Box>
      )}
      <Facts details={details} onLeave={onLeave} />
      <Section title="Description">
        <Typography color={details.description ? 'textPrimary' : 'textSecondary'} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {details.description || 'No description.'}
        </Typography>
      </Section>
      <Section title={`Depends on (${dependsOn.length})`}>
        <DependencyList
          items={dependsOn}
          label="Direct prerequisites"
          emptyText="Does not depend on any other deliverable."
          onOpen={onOpen}
          highlightBlockers
        />
      </Section>
      <Section title={`Dependency chain (${chain.length})`}>
        <ChainSummary chain={chain} />
        <DependencyList items={chain} label="Dependency chain" onOpen={onOpen} showDepth highlightBlockers />
      </Section>
      <Section title={`Blocks (${blocks.length})`}>
        <DependencyList
          items={blocks}
          label="Deliverables that depend on this one"
          emptyText="No other deliverable depends on this one."
          onOpen={onOpen}
        />
      </Section>
    </Stack>
  )
}

function Facts({ details, onLeave }) {
  const facts = [
    [
      'Project',
      <Link component={RouterLink} to={`/projects/${details.project_id}`} onClick={onLeave}>
        {details.project_name}
      </Link>,
    ],
    ['Status', <StatusChip kind="deliverable" value={details.status} />],
    ['Due date', <DueDate date={details.due_date} done={details.status === 'completed'} />],
    ['Owner', details.owner_name || 'Unassigned'],
  ]
  return (
    <Grid container component="dl" spacing={2} sx={{ my: 0 }}>
      {facts.map(([label, value]) => (
        <Grid key={label} size={{ xs: 6, sm: 3 }}>
          <Typography component="dt" variant="body2" color="textSecondary">
            {label}
          </Typography>
          <Box component="dd" sx={{ m: 0, mt: 0.5, wordBreak: 'break-word' }}>
            {value}
          </Box>
        </Grid>
      ))}
    </Grid>
  )
}

/** The dialog title is the h2, so its sections use h3 headings. */
function Section({ title, children }) {
  return (
    <Box component="section">
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

function ChainSummary({ chain }) {
  if (!chain.length) return <Typography color="textSecondary">No prerequisites: nothing has to be finished first.</Typography>
  const open = chain.filter(isBlocker).length
  if (!open) {
    return (
      <Alert severity="success" role="status" sx={{ mb: 1 }}>
        {chain.length === 1 ? 'Its only prerequisite is completed.' : `All ${chain.length} prerequisites are completed.`}
      </Alert>
    )
  }
  return (
    <Alert severity="warning" role="status" sx={{ mb: 1 }}>
      {open} of {countLabel(chain.length, 'prerequisite')} {open === 1 ? 'is' : 'are'} not completed yet and{' '}
      {open === 1 ? 'blocks' : 'block'} this deliverable.
    </Alert>
  )
}

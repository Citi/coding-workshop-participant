import { useCallback, useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { resourcesApi } from '../../services/resourcesApi'
import AllocationsPanel from './AllocationsPanel'
import ResourceDialogs from './ResourceDialogs'
import UtilizationCard from './UtilizationCard'
import { parseId } from '../../utils/ids'

export default function ResourceDetailPage() {
  const { resourceId } = useParams()
  const id = parseId(resourceId)
  if (!id) return <ResourceNotFound />
  // key: opening another person starts from fresh state (no stale data from the previous one).
  return <ResourceDetail key={id} resourceId={id} />
}

function ResourceDetail({ resourceId }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState(null)
  // Bumped when the person is saved: the allocations carry their name (row buttons, delete
  // confirmation), so the panel is mounted again and reloads.
  const [panelKey, setPanelKey] = useState(0)

  const fetchResource = useCallback(() => resourcesApi.get(resourceId), [resourceId])
  const { data: resource, loading, error, reload } = useApiQuery(fetchResource)
  const resourceSaved = () => {
    reload()
    setPanelKey((key) => key + 1)
  }

  if (error?.status === 404) return <ResourceNotFound />
  if (!resource) {
    if (!error) return <LoadingState label="Loading team member…" />
    return (
      <>
        <PageHeader title="Resource" backTo="/resources" backLabel="All resources" />
        <ErrorState error={error} onRetry={reload} title="Could not load the team member" />
      </>
    )
  }

  const actions = [
    can('resources:update') && (
      <Button key="edit" variant="outlined" startIcon={<EditIcon />} onClick={() => setDialog({ mode: 'edit', resource })}>
        Edit
      </Button>
    ),
    can('resources:delete') && (
      <Button key="delete" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDialog({ mode: 'delete', resource })}>
        Delete
      </Button>
    ),
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        title={resource.full_name}
        subtitle={`${resource.job_title} · ${resource.department}`}
        backTo="/resources"
        backLabel="All resources"
        actions={actions.length ? actions : null}
      />
      <Stack direction="row" spacing={1} sx={{ mt: -2, mb: 3, alignItems: 'center', minWidth: 0 }}>
        <EmailOutlinedIcon fontSize="small" color="action" />
        <Link href={`mailto:${resource.email}`} sx={{ wordBreak: 'break-all' }}>
          {resource.email}
        </Link>
      </Stack>

      {error && <ErrorState error={error} onRetry={reload} title="Could not refresh the team member" />}
      <Box sx={{ position: 'relative' }}>
        {loading && <LinearProgress aria-label="Refreshing" sx={{ position: 'absolute', top: -10, left: 0, right: 0 }} />}
        <UtilizationCard resource={resource} />
      </Box>

      <Box sx={{ mt: 3 }}>
        <AllocationsPanel key={panelKey} resourceId={resource.id} onChange={reload} title="Project allocations" />
      </Box>

      <ResourceDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSaved={resourceSaved}
        onDeleted={() => navigate('/resources', { replace: true })}
      />
    </>
  )
}

function ResourceNotFound() {
  return (
    <EmptyState
      titleComponent="h1"
      title="Resource not found"
      message="This team member does not exist or has been deleted."
      action={
        <Button component={RouterLink} to="/resources" variant="contained" startIcon={<ArrowBackIcon />}>
          Back to resources
        </Button>
      }
    />
  )
}

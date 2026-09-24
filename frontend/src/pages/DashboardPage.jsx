import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { Link as RouterLink } from 'react-router'

import useAuth from '../auth/useAuth'
import ActiveTicketCard from '../components/dashboard/ActiveTicketCard'
import MyTicketsPanel from '../components/dashboard/MyTicketsPanel'
import ErrorState from '../components/ErrorState'
import useDebouncedValue from '../hooks/useDebouncedValue'
import useMyTickets from '../hooks/useMyTickets'
import { myTicketsQuery, showCounts } from '../utils/myTicketFilters'
import { firstNameOf, greetingFor } from '../utils/people'
import { formatAgo } from '../utils/ticketFormat'
import { summarizeTickets } from '../utils/ticketStats'

const DEFAULT_FILTERS = { show: 'active', q: '' }

function SummarySkeleton() {
  return (
    <Stack spacing={2.5} aria-label="Loading your tickets" aria-busy="true">
      <Skeleton variant="rounded" height={200} />
      <Skeleton variant="rounded" height={240} />
    </Stack>
  )
}

/** Shown in place of the active ticket when everything is closed. */
function NoActiveTicket() {
  return (
    <Card sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600 }}>
        No active tickets
      </Typography>
      <Typography color="text.secondary">You&apos;re all caught up. Anything you report will show up here.</Typography>
    </Card>
  )
}

/** "3 active tickets · last update 12 min ago". */
function summaryLine({ activeCount, lastUpdatedAt }) {
  const active = `${activeCount} active ticket${activeCount === 1 ? '' : 's'}`
  return lastUpdatedAt ? `${active} · last update ${formatAgo(lastUpdatedAt)}` : active
}

/**
 * Employee home: a greeting, the most recently updated active ticket with its progress
 * and the team's latest message, and "My tickets" with status chips and a search box.
 * Never shows priority.
 */
function DashboardPage() {
  const { user } = useAuth()
  const summary = useMyTickets()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const search = useDebouncedValue(filters.q.trim(), 300)
  const list = useMyTickets(myTicketsQuery({ ...filters, q: search }))
  const filtersActive = filters.show !== 'active' || filters.q.trim() !== ''
  const stats = summary.tickets.length > 0 ? summarizeTickets(summary.tickets) : null

  let content
  if (summary.loading && summary.tickets.length === 0) {
    content = <SummarySkeleton />
  } else if (summary.error) {
    content = <ErrorState message={summary.error.message} onRetry={summary.reload} />
  } else if (!stats) {
    content = (
      <Card sx={{ textAlign: 'center', py: 6, px: 2 }}>
        <Typography component="h2" variant="h5" gutterBottom>
          You haven&apos;t reported any issues yet
        </Typography>
        <Typography color="text.secondary">
          When something in the office needs fixing, report it and follow it here until it&apos;s fixed.
        </Typography>
      </Card>
    )
  } else {
    content = (
      <>
        {stats.mostRecentActive ? (
          // Keyed by ticket so a different active ticket loads its own details.
          <ActiveTicketCard key={stats.mostRecentActive.ticket_id} ticket={stats.mostRecentActive} />
        ) : (
          <NoActiveTicket />
        )}
        <MyTicketsPanel
          filters={filters}
          counts={showCounts(stats)}
          onChange={setFilters}
          list={list}
          filtersActive={filtersActive}
          onClearFilters={() => setFilters(DEFAULT_FILTERS)}
        />
      </>
    )
  }

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-end' } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, overflowWrap: 'anywhere' }}>
            {greetingFor()}, {firstNameOf(user.full_name)}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 15 }}>
            {stats ? summaryLine(stats) : 'Report a problem with your desk, floor or building.'}
          </Typography>
        </Box>
        <Button component={RouterLink} to="/tickets/new" variant="contained" size="large" startIcon={<AddIcon />} sx={{ flex: 'none' }}>
          Report an issue
        </Button>
      </Stack>
      {content}
    </Stack>
  )
}

export default DashboardPage

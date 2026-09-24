import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import TablePagination from '@mui/material/TablePagination'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import PropTypes from 'prop-types'

import usePagination from '../../hooks/usePagination'
import { SHOW_OPTIONS } from '../../utils/myTicketFilters'
import { URGENCIES } from '../../utils/ticketFormat'
import ErrorState from '../ErrorState'
import StatusFilterChips from './StatusFilterChips'
import TicketList from './TicketList'

/** The list body: first-load placeholder, error, no matches, or the (paged) tickets. */
function ListBody({ list, filtersActive, onClearFilters }) {
  const pages = usePagination(list.tickets)

  if (list.error) {
    return (
      <Box sx={{ p: 2 }}>
        <ErrorState message={list.error.message} onRetry={list.reload} />
      </Box>
    )
  }
  if (list.loading && list.tickets.length === 0) {
    return <Skeleton variant="rectangular" height={160} aria-label="Loading tickets" />
  }
  if (list.tickets.length === 0) {
    return (
      <Box sx={{ px: 2.5, py: 3 }}>
        <Typography gutterBottom>No tickets match these filters.</Typography>
        {filtersActive && (
          <Button onClick={onClearFilters} size="small">
            Clear filters
          </Button>
        )}
      </Box>
    )
  }
  return (
    <Box aria-busy={list.loading}>
      {list.loading && <LinearProgress aria-label="Updating tickets" />}
      <TicketList tickets={pages.pageItems} />
      {pages.count > 10 && (
        <TablePagination
          component="div"
          count={pages.count}
          page={pages.page}
          rowsPerPage={pages.rowsPerPage}
          rowsPerPageOptions={[10, 25, 50]}
          onPageChange={(_event, page) => pages.setPage(page)}
          onRowsPerPageChange={(event) => pages.setRowsPerPage(Number(event.target.value))}
          sx={{ borderTop: 1, borderColor: 'divider' }}
        />
      )}
    </Box>
  )
}

ListBody.propTypes = {
  list: PropTypes.shape({
    tickets: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.instanceOf(Error),
    reload: PropTypes.func.isRequired,
  }).isRequired,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
}

/**
 * "My tickets": status chips with counts, search and an urgency filter above the list.
 * The page owns the filters and the request; this lays them out and pages the results.
 */
function MyTicketsPanel({ filters, counts, onChange, list, filtersActive, onClearFilters }) {
  const set = (name) => (event) => onChange({ ...filters, [name]: event.target.value })

  return (
    <Card component="section" aria-labelledby="my-tickets-title" sx={{ overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1.25 }}>
          <Typography id="my-tickets-title" component="h2" sx={{ fontSize: 16, fontWeight: 600 }}>
            My tickets
          </Typography>
          <StatusFilterChips value={filters.show} counts={counts} onChange={(show) => onChange({ ...filters, show })} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
          <TextField
            label="Search"
            placeholder="Title, description or ticket #"
            type="search"
            size="small"
            value={filters.q}
            onChange={set('q')}
            sx={{ flex: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon aria-hidden="true" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField select label="Urgency" size="small" value={filters.urgency} onChange={set('urgency')} sx={{ minWidth: 160 }}>
            <MenuItem value="">All urgencies</MenuItem>
            {Object.entries(URGENCIES).map(([code, { label }]) => (
              <MenuItem key={code} value={code}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Box>
      {/* Keyed by the filters so a new filter starts back on page one. */}
      <ListBody key={JSON.stringify(filters)} list={list} filtersActive={filtersActive} onClearFilters={onClearFilters} />
    </Card>
  )
}

MyTicketsPanel.propTypes = {
  filters: PropTypes.shape({
    show: PropTypes.oneOf(SHOW_OPTIONS).isRequired,
    urgency: PropTypes.string.isRequired,
    q: PropTypes.string.isRequired,
  }).isRequired,
  counts: PropTypes.objectOf(PropTypes.number).isRequired,
  onChange: PropTypes.func.isRequired,
  list: ListBody.propTypes.list,
  filtersActive: PropTypes.bool.isRequired,
  onClearFilters: PropTypes.func.isRequired,
}

export default MyTicketsPanel

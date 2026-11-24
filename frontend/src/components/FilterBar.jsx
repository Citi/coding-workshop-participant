import { useEffect, useRef, useState } from 'react'
import ClearIcon from '@mui/icons-material/FilterAltOff'
import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

// The API rejects a longer `search` parameter with 400 VALIDATION_ERROR.
const SEARCH_MAX_LENGTH = 200

/** The page may trim the search it is sent, so " crm " coming back as "crm" is still the same search. */
const sameSearch = (a, b) => a.trim() === b.trim()

/**
 * Search box (debounced) + filter controls. `values` is the current filter object that the page
 * sends to the API as query parameters; `onChange(nextValues)` replaces it.
 *
 * filters: [{ name, label, options: [{ value, label }] }]   -> select ("All" clears it)
 *          [{ name, label, type: 'toggle' }]                -> switch (true when on, removed when off)
 *
 * The box sends its text 300 ms after the last keystroke. When `values.search` changes from outside
 * (a link, Back/Forward, a reset by the page), the box shows the new text; the page echoing back
 * what the box sent does not count as such a change, so typing is never interrupted.
 */
export default function FilterBar({ values, onChange, filters = [], searchPlaceholder = 'Search', showSearch = true }) {
  const outsideSearch = values.search || ''
  const [searchText, setSearchText] = useState(outsideSearch)
  const debouncedSearch = useDebouncedValue(searchText, 300)
  // The page's search and the debounced text as last seen, and the search the page should now have
  // from the box ("sent"): its debounced text, or the outside text the box took over.
  const [seen, setSeen] = useState({ outside: outsideSearch, debounced: debouncedSearch, sent: outsideSearch })
  const latest = useRef({ values, onChange, searchText })

  if (outsideSearch !== seen.outside || debouncedSearch !== seen.debounced) {
    // Adjusting state while rendering (React's documented alternative to an effect).
    let sent = debouncedSearch !== seen.debounced ? debouncedSearch : seen.sent
    if (outsideSearch !== seen.outside && !sameSearch(outsideSearch, seen.sent)) {
      setSearchText(outsideSearch)
      sent = outsideSearch
    }
    setSeen({ outside: outsideSearch, debounced: debouncedSearch, sent })
  }

  useEffect(() => {
    latest.current = { values, onChange, searchText }
  })

  useEffect(() => {
    const { values: current, onChange: emit, searchText: text } = latest.current
    // Only text still in the box is sent: a search replaced from outside in the meantime is not.
    if (text === debouncedSearch && (current.search || '') !== debouncedSearch) emit({ ...current, search: debouncedSearch || undefined })
  }, [debouncedSearch])

  const update = (name, value) => {
    const next = { ...values }
    if (value === '' || value === false || value === undefined || value === null) delete next[name]
    else next[name] = value
    onChange(next)
  }

  const hasFilters = Object.values(values).some((value) => value !== undefined && value !== '')
  const clear = () => {
    setSearchText('')
    onChange({})
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      {/* useFlexGap: margin-based spacing would indent the controls that wrap onto a second row. */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap' }}>
        {showSearch && (
          <TextField
            label="Search"
            placeholder={searchPlaceholder}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            sx={{ flex: { md: '1 1 240px' } }}
            slotProps={{
              htmlInput: { maxLength: SEARCH_MAX_LENGTH },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        )}
        {filters.map((filter) =>
          filter.type === 'toggle' ? (
            <FormControlLabel
              key={filter.name}
              control={<Switch checked={values[filter.name] === true} onChange={(event) => update(filter.name, event.target.checked)} />}
              label={filter.label}
              sx={{ m: 0 }}
            />
          ) : (
            <TextField
              key={filter.name}
              select
              label={filter.label}
              value={values[filter.name] ?? ''}
              onChange={(event) => update(filter.name, event.target.value)}
              // Fixed width on desktop (the theme makes text fields full width, one per row).
              sx={{ minWidth: 170, flex: { md: '0 0 200px' } }}
            >
              <MenuItem value="">All</MenuItem>
              {filter.options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          ),
        )}
        {hasFilters && (
          <Button onClick={clear} startIcon={<ClearIcon />} sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }}>
            Clear filters
          </Button>
        )}
      </Stack>
    </Paper>
  )
}

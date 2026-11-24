import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import SearchIcon from '@mui/icons-material/Search';

function isActive(value) {
  return value !== undefined && value !== null && value !== '' && value !== false;
}

/**
 * Search box plus select and checkbox filters above a table. Fully controlled: the page
 * owns the values (debounce the search with `useDebouncedValue`). Every input is labelled.
 * Wraps onto several rows on small screens (MUI Grid `size` breakpoints).
 *
 * @example
 * <FilterBar
 *   searchValue={q} onSearchChange={setQ} searchLabel="Search projects"
 *   filters={[{ name: 'status', label: 'Status', value: status, options: toOptions(PROJECT_STATUSES, STATUS_LABELS) }]}
 *   onFilterChange={(name, value) => ...} onClear={clearAll}
 * />
 *
 * @param {object} props - Component props.
 * @param {string} [props.searchValue] - Current search text.
 * @param {(value: string) => void} [props.onSearchChange] - Shows the search box when given.
 * @param {string} [props.searchLabel] - Accessible label of the search box.
 * @param {string} [props.searchPlaceholder] - Placeholder text.
 * @param {Array<{name: string, label: string, value: any, options?: Array<{value: any, label: string}>,
 *   type?: 'select'|'checkbox', allLabel?: string}>} [props.filters] - Filter definitions.
 * @param {(name: string, value: any) => void} [props.onFilterChange] - Called with the filter
 *   name and new value ('' for "All", a boolean for checkboxes).
 * @param {() => void} [props.onClear] - Shows a "Clear filters" button when given.
 * @param {import('react').ReactNode} [props.children] - Extra controls, wrapped in Grid items by the caller.
 * @returns {JSX.Element} The filter bar.
 */
export default function FilterBar({
  searchValue = '',
  onSearchChange,
  searchLabel = 'Search',
  searchPlaceholder,
  filters = [],
  onFilterChange,
  onClear,
  children,
}) {
  const hasActiveFilters = isActive(searchValue) || filters.some((filter) => isActive(filter.value));
  const handleChange = (name, value) => {
    if (onFilterChange) {
      onFilterChange(name, value);
    }
  };

  return (
    <Box
      component="form"
      role="search"
      aria-label="Filters"
      onSubmit={(event) => event.preventDefault()}
      sx={{ mb: 2 }}
    >
      <Grid container spacing={2} sx={{ alignItems: 'center' }}>
        {onSearchChange ? (
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              type="search"
              label={searchLabel}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" aria-hidden="true" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Grid>
        ) : null}
        {filters.map((filter) =>
          filter.type === 'checkbox' ? (
            <Grid key={filter.name} size={{ xs: 12, sm: 'auto' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={Boolean(filter.value)}
                    onChange={(event) => handleChange(filter.name, event.target.checked)}
                  />
                }
                label={filter.label}
              />
            </Grid>
          ) : (
            <Grid key={filter.name} size={{ xs: 12, sm: 6, md: 2 }}>
              <TextField
                select
                fullWidth
                size="small"
                label={filter.label}
                value={filter.value ?? ''}
                onChange={(event) => handleChange(filter.name, event.target.value)}
              >
                <MenuItem value="">{filter.allLabel ?? 'All'}</MenuItem>
                {(filter.options ?? []).map((option) => (
                  <MenuItem key={String(option.value)} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          ),
        )}
        {children}
        {onClear ? (
          <Grid size={{ xs: 12, sm: 'auto' }}>
            <Button onClick={onClear} disabled={!hasActiveFilters} startIcon={<FilterAltOffIcon />}>
              Clear filters
            </Button>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
}

FilterBar.propTypes = {
  searchValue: PropTypes.string,
  onSearchChange: PropTypes.func,
  searchLabel: PropTypes.string,
  searchPlaceholder: PropTypes.string,
  filters: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.bool]),
      type: PropTypes.oneOf(['select', 'checkbox']),
      allLabel: PropTypes.string,
      options: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
          label: PropTypes.string.isRequired,
        }),
      ),
    }),
  ),
  onFilterChange: PropTypes.func,
  onClear: PropTypes.func,
  children: PropTypes.node,
};

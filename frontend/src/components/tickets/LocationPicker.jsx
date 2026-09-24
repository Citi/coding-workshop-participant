import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'


/**
 * One dropdown of the Building -> Floor -> Seat chain.
 * `waitingFor` explains why it is disabled until the level above is chosen.
 */
function LevelSelect({ name, label, value, options, load, waitingFor, required, error, disabled, onChange }) {
  const blocked = Boolean(waitingFor)
  let hint = ' '
  if (blocked) hint = waitingFor
  else if (load.loading) hint = `Loading ${label.toLowerCase()}s…`

  return (
    <TextField
      select
      id={`ticket-${name}`}
      name={name}
      label={label}
      value={value}
      onChange={(event) => onChange(name, event.target.value)}
      required={required}
      disabled={disabled || blocked || load.loading}
      error={Boolean(error)}
      helperText={error || hint}
      fullWidth
    >
      {options.length === 0 && (
        <MenuItem value="" disabled>
          {`No ${label.toLowerCase()}s here`}
        </MenuItem>
      )}
      {options.map((option) => (
        <MenuItem key={option.value} value={String(option.value)}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  )
}

LevelSelect.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.number, label: PropTypes.string })).isRequired,
  load: PropTypes.shape({ loading: PropTypes.bool.isRequired }).isRequired,
  waitingFor: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.string,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
}

/**
 * Cascading location picker. The page loads the lists (useLocationOptions) so it can also
 * describe the choice elsewhere; changing a level clears the levels below it.
 *
 * @param {{building_id: string, floor_id: string, seat_id: string}} props.values
 * @param {ReturnType<import('../../hooks/useLocationOptions').default>} props.locations
 * @param {{floor: boolean, seat: boolean}} props.required which levels the scope needs
 * @param {(changes: object) => void} props.onChange receives the changed ids
 */
function LocationPicker({ values, locations, required, errors, disabled, onChange }) {
  const { buildings, floors, seats } = locations

  const handleChange = (name, value) => {
    if (name === 'building_id') onChange({ building_id: value, floor_id: '', seat_id: '' })
    else if (name === 'floor_id') onChange({ floor_id: value, seat_id: '' })
    else onChange({ seat_id: value })
  }

  const failed = [buildings, floors, seats].find((load) => load.error)
  const options = (load, toOption) => (load.loading || !load.data ? [] : load.data.map(toOption))

  return (
    <Grid container spacing={2}>
      {failed && (
        <Grid size={12}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={failed.reload}>
                Try again
              </Button>
            }
          >
            Couldn&apos;t load locations. {failed.error.message}
          </Alert>
        </Grid>
      )}
      <Grid size={{ xs: 12, md: 4 }}>
        <LevelSelect
          name="building_id"
          label="Building"
          value={values.building_id}
          options={options(buildings, (b) => ({ value: b.building_id, label: b.building_name }))}
          load={buildings}
          required
          error={errors.building_id}
          disabled={disabled}
          onChange={handleChange}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <LevelSelect
          name="floor_id"
          label="Floor"
          value={values.floor_id}
          options={options(floors, (f) => ({ value: f.floor_id, label: `Floor ${f.floor_number}` }))}
          load={floors}
          waitingFor={values.building_id ? '' : 'Choose a building first.'}
          required={required.floor}
          error={errors.floor_id}
          disabled={disabled}
          onChange={handleChange}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <LevelSelect
          name="seat_id"
          label="Seat"
          value={values.seat_id}
          options={options(seats, (s) => ({ value: s.seat_id, label: `Seat ${s.seat_number}` }))}
          load={seats}
          waitingFor={values.floor_id ? '' : 'Choose a floor first.'}
          required={required.seat}
          error={errors.seat_id}
          disabled={disabled}
          onChange={handleChange}
        />
      </Grid>
    </Grid>
  )
}

LocationPicker.propTypes = {
  values: PropTypes.shape({
    building_id: PropTypes.string.isRequired,
    floor_id: PropTypes.string.isRequired,
    seat_id: PropTypes.string.isRequired,
  }).isRequired,
  locations: PropTypes.shape({
    buildings: PropTypes.object.isRequired,
    floors: PropTypes.object.isRequired,
    seats: PropTypes.object.isRequired,
  }).isRequired,
  required: PropTypes.shape({ floor: PropTypes.bool, seat: PropTypes.bool }).isRequired,
  errors: PropTypes.objectOf(PropTypes.string).isRequired,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
}

export default LocationPicker

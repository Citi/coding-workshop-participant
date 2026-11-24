import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useIsMobile } from '../hooks/useIsMobile'
import { isBlank, validEmail } from '../utils/validators'

/**
 * Config-driven create/edit dialog with client-side validation, server error mapping and
 * a loading state that disables the form while saving.
 *
 * fields: [{
 *   name, label, type: 'text'|'email'|'password'|'textarea'|'number'|'date'|'select'|'multiselect'|'checkbox',
 *   required?, options?: [{ value, label }], min?, max?, step?, maxLength?, helperText?,
 *   validate?(value, values) -> string|undefined, half? (half width on desktop), disabled?, autoFocus?
 * }]
 * onSubmit(payload) -> Promise. Resolve after saving (the caller closes the dialog); throw an
 * ApiError to show its message, with `details` shown next to the matching fields.
 * Payload conversion: number -> Number|null, select/date ''-> null, checkbox -> boolean, multiselect -> array.
 * renderAfterFields?(values) -> node: shown under the fields and re-rendered on every change
 * (e.g. a live preview of the values entered so far).
 */
export default function FormDialog({ open, onClose, ...props }) {
  const isMobile = useIsMobile()
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile} aria-labelledby="form-dialog-title">
      {open && <FormDialogBody onClose={onClose} {...props} />}
    </Dialog>
  )
}

function emptyValue(field) {
  if (field.type === 'checkbox') return false
  if (field.type === 'multiselect') return []
  return ''
}

function initialFormValues(fields, initialValues = {}) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = initialValues[field.name]
      if (value === undefined || value === null) return [field.name, emptyValue(field)]
      if (field.type === 'number') return [field.name, String(value)]
      return [field.name, value]
    }),
  )
}

function validateField(field, value, values) {
  if (field.required && isBlank(value) && field.type !== 'checkbox') return 'This field is required'
  if (isBlank(value)) return undefined
  if (field.type === 'email') {
    const emailError = validEmail(value)
    if (emailError) return emailError
  }
  if (field.type === 'number') {
    const number = Number(value)
    if (Number.isNaN(number)) return 'Must be a number'
    if (field.min !== undefined && number < field.min) return `Must be at least ${field.min}`
    if (field.max !== undefined && number > field.max) return `Must be at most ${field.max}`
  }
  if (field.maxLength && String(value).length > field.maxLength) return `Must be at most ${field.maxLength} characters`
  return field.validate ? field.validate(value, values) : undefined
}

function toPayload(fields, values) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.name]
      if (field.type === 'number') return [field.name, isBlank(value) ? null : Number(value)]
      if (field.type === 'select' || field.type === 'date') return [field.name, isBlank(value) ? null : value]
      if (field.type === 'checkbox') return [field.name, Boolean(value)]
      return [field.name, value]
    }),
  )
}

function FormDialogBody({ title, description, fields, initialValues, submitLabel = 'Save', onClose, onSubmit, renderAfterFields }) {
  const [values, setValues] = useState(() => initialFormValues(fields, initialValues))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const setValue = (name, value) => {
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => ({ ...previous, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    fields.forEach((field) => {
      const message = validateField(field, values[field.name], values)
      if (message) nextErrors[field.name] = message
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setFormError('Please fix the highlighted fields.')
      return
    }
    setFormError('')
    setSubmitting(true)
    try {
      await onSubmit(toPayload(fields, values))
    } catch (error) {
      const fieldNames = new Set(fields.map((field) => field.name))
      const serverErrors = {}
      Object.entries(error?.details || {}).forEach(([key, message]) => {
        const name = key.split('.')[0]
        if (fieldNames.has(name)) serverErrors[name] = message
      })
      setErrors(serverErrors)
      setFormError(error?.message || 'Could not save. Please try again.')
      setSubmitting(false)
    }
  }

  const renderField = (field) => {
    const value = values[field.name]
    const error = errors[field.name]
    const common = {
      id: `field-${field.name}`,
      name: field.name,
      label: field.label,
      required: field.required,
      disabled: submitting || field.disabled,
      error: Boolean(error),
      helperText: error || field.helperText,
      autoFocus: field.autoFocus,
    }

    if (field.type === 'checkbox') {
      return (
        <Box>
          <FormControlLabel
            control={<Checkbox checked={Boolean(value)} onChange={(event) => setValue(field.name, event.target.checked)} disabled={common.disabled} name={field.name} />}
            label={field.label}
          />
          {(error || field.helperText) && <FormHelperText error={Boolean(error)}>{error || field.helperText}</FormHelperText>}
        </Box>
      )
    }

    if (field.type === 'multiselect') {
      const options = field.options || []
      const selected = options.filter((option) => (value || []).includes(option.value))
      return (
        <Autocomplete
          multiple
          id={common.id}
          options={options}
          value={selected}
          disabled={common.disabled}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, current) => option.value === current.value}
          onChange={(_event, next) => setValue(field.name, next.map((option) => option.value))}
          renderInput={(params) => (
            <TextField {...params} label={field.label} required={field.required} error={common.error} helperText={common.helperText} />
          )}
        />
      )
    }

    if (field.type === 'select') {
      return (
        <TextField {...common} select value={value ?? ''} onChange={(event) => setValue(field.name, event.target.value)}>
          {!field.required && (
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
          )}
          {(field.options || []).map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )
    }

    const htmlInput = {}
    if (field.maxLength) htmlInput.maxLength = field.maxLength
    if (field.type === 'number') Object.assign(htmlInput, { min: field.min, max: field.max, step: field.step ?? 'any' })
    return (
      <TextField
        {...common}
        type={field.type === 'textarea' ? 'text' : field.type || 'text'}
        multiline={field.type === 'textarea'}
        minRows={field.type === 'textarea' ? 3 : undefined}
        value={value ?? ''}
        onChange={(event) => setValue(field.name, event.target.value)}
        slotProps={{ htmlInput, inputLabel: field.type === 'date' ? { shrink: true } : undefined }}
      />
    )
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit}>
      <DialogTitle id="form-dialog-title">{title}</DialogTitle>
      <DialogContent dividers>
        {description && <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>}
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {formError}
          </Alert>
        )}
        <Grid container spacing={2}>
          {fields.map((field) => (
            <Grid key={field.name} size={{ xs: 12, sm: field.half ? 6 : 12 }}>
              {renderField(field)}
            </Grid>
          ))}
        </Grid>
        {renderAfterFields?.(values)}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={submitting} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </DialogActions>
    </Box>
  )
}

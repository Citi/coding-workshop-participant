import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import DomainIcon from '@mui/icons-material/Domain'
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlineOutlined'
import { Link as RouterLink, useNavigate } from 'react-router'

import TileRadioGroup from '../components/TileRadioGroup'
import { CATEGORY_ICONS } from '../components/tickets/CategoryIcon'
import LocationPicker from '../components/tickets/LocationPicker'
import NewTicketSummary from '../components/tickets/NewTicketSummary'
import useIsDesktop from '../hooks/useIsDesktop'
import useLocationOptions, { describeLocation } from '../hooks/useLocationOptions'
import { ApiError } from '../services/apiClient'
import { createTicket } from '../services/ticketService'
import { CATEGORIES } from '../utils/ticketFormat'
import {
  LIMITS,
  requiredLocation,
  TICKET_FIELDS,
  validateTicketField,
  validateTicketForm,
} from '../utils/ticketValidation'

const EMPTY_FORM = {
  title: '',
  description: '',
  category: '',
  affected_scope: '',
  building_id: '',
  floor_id: '',
  seat_id: '',
}

const CATEGORY_OPTIONS = Object.entries(CATEGORIES).map(([value, label]) => ({
  value,
  label,
  icon: CATEGORY_ICONS[value],
}))

const SCOPE_OPTIONS = [
  { value: 'me', label: 'Just me', icon: PersonOutlineIcon },
  { value: 'floor', label: 'My floor', icon: LayersOutlinedIcon },
  { value: 'building', label: 'Whole building', icon: DomainIcon },
].map((option) => ({ ...option, selectedIcon: CheckIcon }))

/** What the "Where" step asks for, given who is affected. */
const WHERE_HINTS = {
  '': 'Pick only the levels that apply.',
  me: 'Just you: pick your building, floor and seat.',
  floor: 'Your floor: pick the building and floor.',
  building: 'The whole building: pick the building.',
}

/** "1 · What's wrong": a numbered step, named for screen readers without the number. */
function Section({ number, title, hint, children }) {
  const id = `section-${number}`
  return (
    <Box component="section" aria-labelledby={id} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1.25, rowGap: 0.25 }}>
        <Typography
          id={id}
          component="h2"
          sx={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}
        >
          <span aria-hidden="true">{number} · </span>
          {title}
        </Typography>
        {hint && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{hint}</Typography>}
      </Box>
      {children}
    </Box>
  )
}

Section.propTypes = {
  number: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  hint: PropTypes.string,
  children: PropTypes.node.isRequired,
}

/** "12/150" under a text field, or its error when there is one. */
function counted(value, limit, error) {
  return error || `${value.trim().length}/${limit}`
}

/**
 * Report a facility issue in three steps: what's wrong (title, description and a category
 * tile), who is affected, and where (Building -> Floor -> Seat, as much as that scope
 * needs). A live summary sits beside the form on desktop and above the
 * buttons on smaller screens. The API sets status and the internal priority, which
 * employees never see.
 */
function CreateTicketPage() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [values, setValues] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const locations = useLocationOptions(values)
  const required = requiredLocation(values.affected_scope)
  const labelOf = (options, value) => options.find((option) => option.value === value)?.label ?? ''
  const summary = (
    <NewTicketSummary
      rows={[
        ['Category', CATEGORIES[values.category] ?? ''],
        ['Location', describeLocation(values, locations)],
        ['Affects', labelOf(SCOPE_OPTIONS, values.affected_scope)],
      ]}
    />
  )

  /** Apply changes; re-check any field already showing an error (scope affects floor/seat). */
  const update = (changes) => {
    const next = { ...values, ...changes }
    setValues(next)
    const rechecked = {}
    for (const field of Object.keys(errors)) {
      if (errors[field]) rechecked[field] = validateTicketField(field, next)
    }
    setErrors({ ...errors, ...rechecked })
  }

  const handleText = (event) => update({ [event.target.name]: event.target.value })
  const handleChoice = (name, value) => update({ [name]: value })

  const handleBlur = (event) => {
    const { name } = event.target
    if (values[name]) setErrors({ ...errors, [name]: validateTicketField(name, values) })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    const found = validateTicketForm(values)
    setErrors(found)
    const firstInvalid = TICKET_FIELDS.find((field) => found[field])
    if (firstInvalid) {
      const target =
        document.getElementById(`ticket-${firstInvalid}`) ??
        document.querySelector(`input[name="${firstInvalid}"]`)
      target.focus()
      return
    }

    setSubmitting(true)
    try {
      const ticket = await createTicket(values)
      navigate(`/tickets/${ticket.ticket_id}`, { state: { createdTicket: true } })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.')
      } else if (Object.keys(error.fieldErrors).some((f) => TICKET_FIELDS.includes(f))) {
        setErrors(error.fieldErrors)
        setFormError('Please fix the highlighted fields.')
      } else {
        // e.g. 400 "Floor 4 is not in building 1" if locations changed meanwhile.
        setFormError(error.message)
      }
      setSubmitting(false)
    }
  }

  const textField = (name, label, props = {}) => (
    <TextField
      id={`ticket-${name}`}
      name={name}
      label={label}
      value={values[name]}
      onChange={handleText}
      onBlur={handleBlur}
      error={Boolean(errors[name])}
      disabled={submitting}
      required
      fullWidth
      {...props}
    />
  )

  return (
    <Stack spacing={2.5}>
      <Breadcrumbs aria-label="Breadcrumb">
        <Link component={RouterLink} to="/dashboard" underline="hover" color="text.secondary">
          Dashboard
        </Link>
        <Typography aria-current="page" sx={{ fontWeight: 600, color: 'text.primary' }}>
          Report an issue
        </Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        <Card sx={{ flex: 1.65, minWidth: 0, p: { xs: 2, sm: 3.5 } }}>
          <form onSubmit={handleSubmit} noValidate>
            <Stack spacing={3.5}>
              <Box>
                <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 22, sm: 24 } }}>
                  Report an issue
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 14 }}>
                  Tell us what&apos;s wrong and where. Fields marked * are required.
                </Typography>
              </Box>

              {formError && <Alert severity="error">{formError}</Alert>}

              <Section number={1} title="What's wrong">
                {textField('title', 'Title', {
                  helperText: counted(values.title, LIMITS.title, errors.title),
                })}
                {textField('description', 'Full description', {
                  multiline: true,
                  minRows: 3,
                  helperText: counted(values.description, LIMITS.description, errors.description),
                })}
                <TileRadioGroup
                  name="category"
                  label="Category"
                  options={CATEGORY_OPTIONS}
                  value={values.category}
                  onChange={handleChoice}
                  error={errors.category}
                  required
                  disabled={submitting}
                  columns={{ xs: 1, sm: 2, md: 4 }}
                />
              </Section>

              <Section number={2} title="Who is affected?">
                <TileRadioGroup
                  name="affected_scope"
                  label="Who is affected?"
                  hideLabel
                  variant="segmented"
                  options={SCOPE_OPTIONS}
                  value={values.affected_scope}
                  onChange={handleChoice}
                  error={errors.affected_scope}
                  required
                  disabled={submitting}
                />
              </Section>

              <Section number={3} title="Where" hint={WHERE_HINTS[values.affected_scope]}>
                <LocationPicker
                  values={values}
                  locations={locations}
                  required={required}
                  errors={errors}
                  disabled={submitting}
                  onChange={update}
                />
              </Section>

              {!isDesktop && summary}

              <Stack
                direction={{ xs: 'column-reverse', sm: 'row' }}
                spacing={1.5}
                sx={{ justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider', pt: 2 }}
              >
                <Button component={RouterLink} to="/dashboard" disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={submitting}
                  startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
                >
                  {submitting ? 'Submitting…' : 'Submit ticket'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </Card>

        {isDesktop && <Box sx={{ flex: 1, minWidth: 0, position: 'sticky', top: 24 }}>{summary}</Box>}
      </Box>
    </Stack>
  )
}

export default CreateTicketPage

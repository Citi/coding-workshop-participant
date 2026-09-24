import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useLocation, useNavigate } from 'react-router'

import useAuth from '../auth/useAuth'
import AuthCard from '../components/AuthCard'
import PasswordField from '../components/PasswordField'
import { ApiError } from '../services/apiClient'
import { login } from '../services/authService'
import { homePathFor } from '../utils/roles'

/**
 * Pick the banner for how the user got here: just registered, signed out (by
 * choice or because the session ended), or sent from a page that needs sign-in.
 */
function arrivalNotice(state, signOutNotice) {
  if (state?.registeredEmail) {
    return { severity: 'success', text: `Account created for ${state.registeredEmail}. Please sign in.` }
  }
  if (signOutNotice) return { severity: 'info', text: signOutNotice }
  if (state?.from) return { severity: 'info', text: 'Please sign in to continue.' }
  return null
}

/**
 * Sign in with work email and password, then return to where the user was headed,
 * or to the start page for their role.
 */
function LoginPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { signIn, notice: signOutNotice } = useAuth()
  const [values, setValues] = useState({ email: state?.registeredEmail ?? '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const notice = arrivalNotice(state, signOutNotice)

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues({ ...values, [name]: value })
    if (errors[name]) setErrors({ ...errors, [name]: '' })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    const found = {}
    if (!values.email.trim()) found.email = 'Enter your work email.'
    if (!values.password) found.password = 'Enter your password.'
    setErrors(found)
    if (found.email || found.password) {
      document.getElementById(found.email ? 'login-email' : 'login-password').focus()
      return
    }

    setSubmitting(true)
    try {
      const session = await login(values)
      signIn(session)
      navigate(state?.from ?? homePathFor(session.user.role), { replace: true })
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Use your ACME work account.">
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.5}>
          {notice && !formError && <Alert severity={notice.severity}>{notice.text}</Alert>}
          {formError && <Alert severity="error">{formError}</Alert>}

          <TextField
            id="login-email"
            name="email"
            label="Work email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={handleChange}
            error={Boolean(errors.email)}
            helperText={errors.email || ' '}
            disabled={submitting}
            fullWidth
          />
          <PasswordField
            id="login-password"
            name="password"
            label="Password"
            autoComplete="current-password"
            required
            // Just registered: the email is filled in, so start on the password.
            autoFocus={Boolean(state?.registeredEmail)}
            value={values.password}
            onChange={handleChange}
            error={Boolean(errors.password)}
            helperText={errors.password || ' '}
            disabled={submitting}
            fullWidth
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </form>
    </AuthCard>
  )
}

export default LoginPage

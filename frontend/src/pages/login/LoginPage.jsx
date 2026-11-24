import { useEffect, useState } from 'react'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { WAKE_UP_HINT } from '../../components/StateViews'
import { APP_NAME } from '../../config'
import { useAuth } from '../../context/authContext'
import { useDelayedFlag } from '../../hooks/useDelayedFlag'
import { warmUp } from '../../services/healthApi'
import { validEmail } from '../../utils/validators'

function validate({ email, password }) {
  const errors = {}
  if (!email.trim()) errors.email = 'Email is required'
  else if (validEmail(email)) errors.email = validEmail(email)
  if (!password) errors.password = 'Password is required'
  return errors
}

export default function LoginPage() {
  const { login, isAuthenticated, sessionMessage, clearSessionMessage } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const slowSignIn = useDelayedFlag(submitting)

  // Start waking the database while the user types. Fire-and-forget: warmUp never throws and its
  // result is ignored, so a failed ping cannot reach the form.
  useEffect(() => {
    if (!isAuthenticated) warmUp()
  }, [isAuthenticated])

  const redirectTo = location.state?.from?.pathname || '/'
  if (isAuthenticated) return <Navigate to={redirectTo} replace />

  const change = (name) => (event) => {
    setForm((previous) => ({ ...previous, [name]: event.target.value }))
    setFieldErrors((previous) => ({ ...previous, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setSubmitting(true)
    setError('')
    clearSessionMessage()
    try {
      await login(form.email.trim(), form.password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err?.message || 'Login failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      <Paper component="main" sx={{ p: { xs: 3, sm: 5 }, width: '100%', maxWidth: 420 }}>
        <Stack spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography variant="h5" component="h1">
            {APP_NAME}
          </Typography>
          <Typography color="textSecondary">Sign in to continue</Typography>
        </Stack>

        {sessionMessage && !error && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {sessionMessage}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}

        <Box component="form" noValidate onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              id="login-email"
              label="Email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={form.email}
              onChange={change('email')}
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email}
              disabled={submitting}
              size="medium"
            />
            <TextField
              id="login-password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={form.password}
              onChange={change('password')}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password}
              disabled={submitting}
              size="medium"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((value) => !value)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
          {/* Always rendered (empty until needed) so screen readers announce the hint when it appears. */}
          <Typography
            role="status"
            aria-live="polite"
            variant="body2"
            color="textSecondary"
            sx={{ mt: slowSignIn ? 2 : 0, textAlign: 'center' }}
          >
            {slowSignIn ? WAKE_UP_HINT : ''}
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}

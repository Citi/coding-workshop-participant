import { useRef, useState } from 'react';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import AuthLayout from '../components/AuthLayout.jsx';
import { useAuth } from '../auth/useAuth.js';
import { describeFormError, validateLogin } from '../utils/validation.js';

const FIELDS = ['email', 'password'];

function redirectTarget(from) {
  const pathname = from?.pathname;
  if (!pathname || pathname === '/login' || pathname === '/register') {
    return '/';
  }
  return `${pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

/**
 * Sign-in page. Validates before submitting, shows field errors next to the fields
 * (including the server's per-field details), disables the form while signing in, and
 * returns the user to the page they originally asked for.
 * @returns {JSX.Element} The page.
 */
export default function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [values, setValues] = useState(() => ({ email: location.state?.email ?? '', password: '' }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (user) {
    return <Navigate to={redirectTarget(location.state?.from)} replace />;
  }

  const notice =
    location.state?.reason === 'expired'
      ? 'Your session has expired. Please sign in again.'
      : location.state?.registered
        ? 'Your account was created. Please sign in.'
        : '';

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => {
      if (!previous[name]) {
        return previous;
      }
      const next = { ...previous };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const found = validateLogin(values);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      // The user is now set, so this page re-renders and <Navigate> takes over.
    } catch (error) {
      const described = describeFormError(error, FIELDS);
      setErrors(described.fieldErrors);
      setFormError(described.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Portfolio, capacity and delivery risk for ACME Inc."
      footer={
        <Typography variant="body2" color="text.secondary">
          New here?{' '}
          <Link component={RouterLink} to="/register">
            Create an account
          </Link>
        </Typography>
      }
    >
      <Stack component="form" noValidate onSubmit={handleSubmit} spacing={2} aria-label="Sign in">
        {notice && !formError ? <Alert severity="info">{notice}</Alert> : null}
        {formError ? <Alert severity="error">{formError}</Alert> : null}
        <TextField
          inputRef={emailRef}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={Boolean(errors.email)}
          helperText={errors.email || ' '}
          disabled={submitting}
          required
          fullWidth
          autoFocus
        />
        <TextField
          inputRef={passwordRef}
          name="password"
          type={showPassword ? 'text' : 'password'}
          label="Password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={Boolean(errors.password)}
          helperText={errors.password || ' '}
          disabled={submitting}
          required
          fullWidth
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((shown) => !shown)}
                    edge="end"
                    disabled={submitting}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
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
          startIcon={submitting ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}

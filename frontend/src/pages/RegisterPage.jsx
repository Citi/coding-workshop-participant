import { useRef, useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AuthLayout from '../components/AuthLayout.jsx';
import { useAuth } from '../auth/useAuth.js';
import { useNotify } from '../notifications/useNotify.js';
import { register as registerAccount } from '../services/auth.js';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_BYTES,
  describeFormError,
  validateRegistration,
} from '../utils/validation.js';

const FIELDS = ['name', 'email', 'password', 'confirmPassword'];
const FIELD_ORDER = ['name', 'email', 'password', 'confirmPassword'];

/**
 * Registration page. New accounts always get the Viewer role (the server enforces it);
 * an Admin can change the role and department later. Validates before submitting, shows
 * field errors (including the server's), then signs the new user in automatically.
 * @returns {JSX.Element} The page.
 */
export default function RegisterPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

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
    const found = validateRegistration(values);
    setErrors(found);
    setFormError('');
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      const refs = { name: nameRef, email: emailRef, password: passwordRef, confirmPassword: confirmPasswordRef };
      refs[firstInvalid].current?.focus();
      return;
    }

    setSubmitting(true);
    const email = values.email.trim();
    try {
      await registerAccount({ name: values.name.trim(), email, password: values.password });
    } catch (error) {
      const described = describeFormError(error, FIELDS);
      setErrors(described.fieldErrors);
      setFormError(described.message);
      setSubmitting(false);
      return;
    }

    try {
      await login(email, values.password);
      notify.success(`Welcome, ${values.name.trim()}. Your account has Viewer access.`);
    } catch {
      // The account exists; let the user sign in by hand.
      navigate('/login', { replace: true, state: { email, registered: true } });
    }
  };

  const fieldProps = (name) => ({
    name,
    value: values[name],
    onChange: handleChange,
    error: Boolean(errors[name]),
    disabled: submitting,
    required: true,
    fullWidth: true,
  });

  return (
    <AuthLayout
      title="Create an account"
      subtitle="New accounts start with read-only Viewer access."
      footer={
        <Typography variant="body2" color="text.secondary">
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </Typography>
      }
    >
      <Stack component="form" noValidate onSubmit={handleSubmit} spacing={2} aria-label="Create an account">
        {formError ? <Alert severity="error">{formError}</Alert> : null}
        <TextField
          {...fieldProps('name')}
          inputRef={nameRef}
          label="Full name"
          autoComplete="name"
          helperText={errors.name || ' '}
          autoFocus
        />
        <TextField
          {...fieldProps('email')}
          inputRef={emailRef}
          type="email"
          label="Email"
          autoComplete="email"
          helperText={errors.email || ' '}
        />
        <TextField
          {...fieldProps('password')}
          inputRef={passwordRef}
          type="password"
          label="Password"
          autoComplete="new-password"
          helperText={errors.password || `${PASSWORD_MIN_BYTES} to ${PASSWORD_MAX_BYTES} characters.`}
        />
        <TextField
          {...fieldProps('confirmPassword')}
          inputRef={confirmPasswordRef}
          type="password"
          label="Confirm password"
          autoComplete="new-password"
          helperText={errors.confirmPassword || ' '}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}

/** Takes no props. */
RegisterPage.propTypes = {};

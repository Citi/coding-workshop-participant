import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Link, Stack, Typography } from '@mui/material';
import FormField from '../common/FormField';
import { MIN_PASSWORD_LENGTH, validateCredentials } from '../../utils/validators';
import useAuth from '../../hooks/useAuth';
import { ROLE_HINTS, ROLE_LABELS } from '../../utils/constants';

/**
 * Sign-in form, with an inline switch to sign-up.
 *
 * Registration lives here because a fresh database has no accounts at all --
 * the backend grants Admin to the first user and derives every later role from
 * the email address, so this screen is what bootstraps a deployment.
 */


export default function LoginForm({ onSuccess }) {
  const { login, register } = useAuth();

  const [isRegistering, setIsRegistering] = useState(false);
  const [values, setValues] = useState({ email: '', password: '', fullName: '' });
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const next = { ...values, [name]: value };
    setValues(next);

    // Re-validate live only after a first submit, so errors clear as the user
    // fixes them without nagging during initial typing.
    if (attempted) setErrors(validateCredentials(next, isRegistering));
  };

  const switchMode = () => {
    setIsRegistering((current) => !current);
    setErrors({});
    setAttempted(false);
    setServerError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);

    const found = validateCredentials(values, isRegistering);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const action = isRegistering ? register : login;
      await action({
        email: values.email.trim(),
        password: values.password,
        ...(isRegistering ? { fullName: values.fullName.trim() } : {}),
      });
      onSuccess?.();
    } catch (error) {
      setServerError(error);
      // Field-level detail from the backend goes next to the offending input.
      if (error.fieldErrors && Object.keys(error.fieldErrors).length) {
        setErrors((current) => ({ ...current, ...error.fieldErrors }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const errorFor = (field) => (attempted ? errors[field] : undefined);
  const hasFieldErrors = Boolean(
    serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length,
  );

  return (
    <Box>
      <Typography variant="h2" component="h2" gutterBottom>
        {isRegistering ? 'Create an account' : 'Sign in'}
      </Typography>

      {/* A real form gives Enter-to-submit and browser password managers. */}
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2} sx={{ mt: 2 }}>
          {/* Non-field failures (bad credentials, network, 500) go on top. */}
          {serverError && !hasFieldErrors && <Alert severity="error">{serverError.message}</Alert>}

          {isRegistering && (
            <FormField
              name="fullName"
              label="Full name"
              value={values.fullName}
              onChange={handleChange}
              error={errorFor('fullName')}
              autoComplete="name"
              required
              disabled={submitting}
            />
          )}

          <FormField
            name="email"
            label="Email"
            type="email"
            value={values.email}
            onChange={handleChange}
            error={errorFor('email')}
            autoComplete="email"
            autoFocus
            required
            disabled={submitting}
          />

          <FormField
            name="password"
            label="Password"
            type="password"
            value={values.password}
            onChange={handleChange}
            error={errorFor('password')}
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            helperText={isRegistering ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
            required
            disabled={submitting}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {submitting
              ? isRegistering
                ? 'Creating account…'
                : 'Signing in…'
              : isRegistering
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </Stack>
      </form>

      {/* The backend derives the role from the address; spelling the rule out
          here means nobody is surprised by the access they end up with. */}
      {isRegistering && (
        <Box sx={{ mt: 2.5, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Your role is set by your email address
          </Typography>
          <Stack spacing={0.25}>
            {ROLE_HINTS.map((hint) => (
              <Stack key={hint.pattern} direction="row" justifyContent="space-between" spacing={2}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                  {hint.pattern}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {ROLE_LABELS[hint.role]}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <Divider sx={{ my: 2.5 }} />

      <Typography variant="body2" align="center" color="text.secondary">
        {isRegistering ? 'Already have an account?' : 'No account yet?'}{' '}
        <Link component="button" type="button" onClick={switchMode} disabled={submitting}>
          {isRegistering ? 'Sign in' : 'Create one'}
        </Link>
      </Typography>
    </Box>
  );
}

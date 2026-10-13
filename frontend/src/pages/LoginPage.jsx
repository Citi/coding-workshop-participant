import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Link, Stack, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../services/AuthContext';
import { tokens } from '../theme';

const DEMO_ACCOUNTS = [
  { role: 'Admin', username: 'admin', password: 'Admin123!' },
  { role: 'Manager', username: 'mlopez', password: 'Manager123!' },
  { role: 'Employee', username: 'apatel', password: 'Employee123!' },
];

/** A decorative week of time cards: five 8-hour days filling up. */
function WeekCard() {
  const days = [['Mon', 8], ['Tue', 8], ['Wed', 6], ['Thu', 8], ['Fri', 3]];
  return (
    <Box aria-hidden sx={{ display: 'grid', gap: 1.25, maxWidth: 360 }}>
      {days.map(([day, h]) => (
        <Box key={day} sx={{ display: 'grid', gridTemplateColumns: '44px 1fr 36px', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ color: '#A9C0BD', fontWeight: 700 }}>{day}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '3px' }}>
            {Array.from({ length: 8 }, (_, i) => (
              <Box key={i} sx={{ height: 14, borderRadius: '2px', bgcolor: i < h ? tokens.marigold : 'rgba(255,255,255,0.12)' }} />
            ))}
          </Box>
          <Typography sx={{ color: '#E7EFEE', textAlign: 'right' }}>{`${h} h`}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Sign-in screen. */
export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {
      username: values.username.trim() ? undefined : 'Enter your username or email.',
      password: values.password ? undefined : 'Enter your password.',
    };
    setErrors(next);
    if (next.username || next.password) return;
    setBusy(true);
    setFormError('');
    try {
      await login(values.username.trim(), values.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (name) => (e) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors((er) => ({ ...er, [name]: undefined }));
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' } }}>
      <Box sx={{
        bgcolor: tokens.ink, color: '#fff', p: { xs: 4, md: 8 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5,
      }}
      >
        <Box>
          <Typography component="p" sx={{ fontWeight: 700, color: tokens.marigold, mb: 2 }}>Project Tracker</Typography>
          <Typography variant="h1" component="p" sx={{ fontSize: { xs: '2rem', md: '2.75rem' }, maxWidth: '16ch', color: '#fff' }}>
            Every project, milestone and hour in one place.
          </Typography>
          <Typography sx={{ mt: 2, color: '#C5D6D4', maxWidth: '44ch' }}>
            Plan work in 8-hour days, see who is on what, and know before a deadline slips.
          </Typography>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}><WeekCard /></Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, md: 6 } }}>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: '100%', maxWidth: 380 }}>
          <Typography variant="h2" component="h1" gutterBottom>Sign in</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Use the account your administrator gave you.</Typography>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label="Username or email"
              autoComplete="username"
              autoFocus
              value={values.username}
              onChange={set('username')}
              error={Boolean(errors.username)}
              helperText={errors.username}
              disabled={busy}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={set('password')}
              error={Boolean(errors.password)}
              helperText={errors.password}
              disabled={busy}
            />
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>

          <Box component="details" sx={{ mt: 4, color: 'text.secondary', '& summary': { cursor: 'pointer', fontWeight: 700 } }}>
            <summary>Demo accounts</summary>
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              {DEMO_ACCOUNTS.map((a) => (
                <Typography key={a.username} variant="body2">
                  <Link
                    component="button"
                    type="button"
                    onClick={() => setValues({ username: a.username, password: a.password })}
                    sx={{ fontWeight: 700 }}
                  >
                    {a.role}
                  </Link>
                  {`: ${a.username} / ${a.password}`}
                </Typography>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

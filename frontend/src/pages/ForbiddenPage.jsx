import { Box, Button, Container, Stack, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { Link as RouterLink } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../utils/constants';

/**
 * Where ProtectedRoute sends an authenticated user who lacks the permission.
 *
 * Explains what their role does cover rather than just refusing -- a bare
 * "access denied" leaves the user with nowhere to go and nothing to learn.
 */
export default function ForbiddenPage() {
  const { role } = useAuth();

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} alignItems="center" textAlign="center">
        <Box sx={{ color: 'text.disabled' }} aria-hidden="true">
          <LockIcon sx={{ fontSize: 56 }} />
        </Box>

        <Typography variant="h1" component="h2">
          Not available to your role
        </Typography>

        <Typography color="text.secondary">
          You are signed in as a <strong>{ROLE_LABELS[role] ?? role}</strong>.{' '}
          {ROLE_DESCRIPTIONS[role]}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          If you need broader access, ask an Admin to change your role.
        </Typography>

        <Button component={RouterLink} to="/" variant="contained" sx={{ mt: 1 }}>
          Back to dashboard
        </Button>
      </Stack>
    </Container>
  );
}

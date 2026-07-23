import { Box, Fade, Grow, Paper, Stack, Typography } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FolderIcon from '@mui/icons-material/Folder';
import InsightsIcon from '@mui/icons-material/Insights';
import PaymentsIcon from '@mui/icons-material/Payments';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import useAuth from '../hooks/useAuth';

/**
 * Sign-in screen.
 *
 * A split layout: a branded, dark showcase panel on the left (what the product
 * does) and the sign-in card on the right. The page owns the layout and the
 * post-login redirect; the form owns the fields and the API calls. On success
 * the user is sent back to whatever they were trying to reach, which
 * ProtectedRoute stashed in `location.state.from`.
 *
 * The showcase panel is hidden below `md`, where the form takes the full width
 * and a compact brand header stands in for it.
 */

// The three things the platform answers at a glance -- mirrors the dashboard.
const HIGHLIGHTS = [
  {
    icon: <FolderIcon />,
    title: 'Project portfolio',
    description: 'Every project, its status and deadline, tracked in one place.',
  },
  {
    icon: <InsightsIcon />,
    title: 'Risk & reporting',
    description: 'Surface at-risk projects and over-allocated people early.',
  },
  {
    icon: <PaymentsIcon />,
    title: 'Budget visibility',
    description: 'See planned versus consumed budget for every project.',
  },
];

/** Brand lockup — the gradient mark plus the product name. Reused in the dark
 *  panel and, in a lighter form, on the mobile header. */
function Brand({ dark = false }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <Box
        aria-hidden="true"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: 2.5,
          color: 'common.white',
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          boxShadow: '0 6px 18px rgba(79, 70, 229, 0.45)',
        }}
      >
        <AccountTreeIcon />
      </Box>
      <Box>
        <Typography
          variant="h3"
          component="div"
          sx={{ fontWeight: 700, lineHeight: 1.1, color: dark ? 'common.white' : 'text.primary' }}
        >
          ACME CPM
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: dark ? 'rgba(255,255,255,0.65)' : 'text.secondary' }}
        >
          Centralized Project Management
        </Typography>
      </Box>
    </Stack>
  );
}

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from = location.state?.from?.pathname ?? '/';

  // Already signed in -- skip the form rather than showing it and immediately
  // redirecting, which flashes.
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 2, md: 4 },
        // A deep indigo→slate wash sets the product apart from the app's light
        // canvas without leaving the brand family.
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #0f172a 100%)',
      }}
    >
      <Grow in timeout={500}>
        <Box
          sx={{
            width: '100%',
            maxWidth: 1120,
            display: 'flex',
            borderRadius: 5,
            overflow: 'hidden',
            // Frosted container so the gradient reads through its edges.
            bgcolor: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 40px 80px rgba(2, 6, 23, 0.45)',
          }}
        >
          {/* LEFT — branded showcase, md and up only. */}
          <Box
            sx={{
              flex: 1,
              display: { xs: 'none', md: 'flex' },
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 6,
              p: 6,
              color: 'common.white',
            }}
          >
            <Brand dark />

            <Fade in timeout={900}>
              <Box>
                <Typography
                  variant="h1"
                  sx={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.15, mb: 2 }}
                >
                  Deliver projects
                  <br />
                  with clarity.
                </Typography>
                <Typography
                  sx={{ color: 'rgba(255,255,255,0.72)', fontSize: '1rem', maxWidth: 440, lineHeight: 1.7 }}
                >
                  Real-time visibility into project health, resource utilisation and delivery
                  progress — in one self-service platform.
                </Typography>
              </Box>
            </Fade>

            <Stack spacing={2}>
              {HIGHLIGHTS.map((item) => (
                <Box
                  key={item.title}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    p: 2.5,
                    borderRadius: 3,
                    bgcolor: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    transition: 'transform 160ms ease, background-color 160ms ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      bgcolor: 'rgba(255, 255, 255, 0.1)',
                    },
                  }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      width: 42,
                      height: 42,
                      borderRadius: 2,
                      color: '#a5b4fc',
                      bgcolor: 'rgba(99, 102, 241, 0.18)',
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, mb: 0.25 }}>{item.title}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem' }}>
                      {item.description}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>

          {/* RIGHT — the sign-in card. */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: { xs: 2, sm: 4 },
            }}
          >
            <Paper
              sx={{
                width: '100%',
                maxWidth: 420,
                p: { xs: 3, sm: 4 },
                borderRadius: 4,
                border: 'none',
                // Solid white: this card sits over the dark gradient, where the
                // global translucent Paper would wash the form out.
                bgcolor: 'common.white',
                backdropFilter: 'none',
                boxShadow: '0 24px 60px rgba(2, 6, 23, 0.25)',
              }}
            >
              {/* Compact brand for small screens, where the showcase is hidden. */}
              <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
                <Brand />
              </Box>

              <LoginForm onSuccess={() => navigate(from, { replace: true })} />
            </Paper>
          </Box>
        </Box>
      </Grow>
    </Box>
  );
}

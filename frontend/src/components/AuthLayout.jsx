import { useEffect } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import InsightsIcon from '@mui/icons-material/Insights';
import { APP_NAME } from '../constants.js';

/**
 * Centred card layout for the sign-in and registration pages.
 * @param {object} props - Component props.
 * @param {string} props.title - Page heading (the h1) and browser tab title.
 * @param {import('react').ReactNode} [props.subtitle] - Line under the heading.
 * @param {import('react').ReactNode} props.children - The form.
 * @param {import('react').ReactNode} [props.footer] - Links under the form.
 * @returns {JSX.Element} The layout.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  useEffect(() => {
    document.title = `${title} | ${APP_NAME}`;
  }, [title]);

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 4,
      }}
    >
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 4 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
          <InsightsIcon color="primary" aria-hidden="true" />
          <Typography variant="subtitle1" component="p" sx={{ fontWeight: 700 }}>
            {APP_NAME}
          </Typography>
        </Stack>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
        <Box sx={{ mt: 3 }}>{children}</Box>
        {footer ? <Box sx={{ mt: 3 }}>{footer}</Box> : null}
      </Paper>
    </Box>
  );
}

AuthLayout.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  children: PropTypes.node.isRequired,
  footer: PropTypes.node,
};

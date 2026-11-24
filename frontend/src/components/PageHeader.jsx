import { useEffect } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { APP_NAME } from '../constants.js';

/**
 * Page title row: the page's single h1, an optional subtitle and actions on the right.
 * Also sets the browser tab title to "<title> | ACME Project Intelligence".
 * @param {object} props - Component props.
 * @param {string} props.title - Page title.
 * @param {import('react').ReactNode} [props.subtitle] - One line under the title.
 * @param {import('react').ReactNode} [props.actions] - Buttons shown beside the title.
 * @param {import('react').ReactNode} [props.breadcrumbs] - Shown above the title.
 * @returns {JSX.Element} The header.
 */
export default function PageHeader({ title, subtitle, actions, breadcrumbs }) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
  }, [title]);

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'flex-start' },
        justifyContent: 'space-between',
        gap: 2,
        mb: 3,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {breadcrumbs}
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexShrink: 0 }}>{actions}</Box>
      ) : null}
    </Box>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  actions: PropTypes.node,
  breadcrumbs: PropTypes.node,
};

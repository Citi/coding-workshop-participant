import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';

/**
 * Page title row with optional supporting text and actions on the right.
 * @param {{title: string, subtitle?: React.ReactNode, actions?: React.ReactNode, children?: React.ReactNode}} props
 */
export default function PageHeader({
  title, subtitle, actions, children,
}) {
  return (
    <Box sx={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 3,
    }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
        <Typography variant="h1">{title}</Typography>
        {subtitle && <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: '70ch' }}>{subtitle}</Typography>}
        {children}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  actions: PropTypes.node,
  children: PropTypes.node,
};

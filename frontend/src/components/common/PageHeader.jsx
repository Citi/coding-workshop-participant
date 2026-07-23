import { Box, Stack, Typography } from '@mui/material';

/**
 * The title block every page opens with.
 *
 * Centralised so heading levels stay consistent: the AppBar owns the <h1>, so
 * a page title is an <h2> however large it renders.
 */
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'center' }}
      spacing={2}
      sx={{ mb: 3 }}
    >
      <Box>
        <Typography variant="h1" component="h2">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>

      {actions && (
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }} alignItems="center">
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

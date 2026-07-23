import { Box, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { SHADOWS } from '../../styles/theme';

/**
 * A single headline number on the dashboard.
 *
 * Separate from the widgets so every tile shares one loading skeleton and one
 * layout -- four tiles each inventing their own spacing read as four unrelated
 * components.
 */
export default function StatTile({
  label,
  value,
  caption,
  icon,
  color = 'primary',
  emphasis,
  loading = false,
}) {
  return (
    <Paper
      sx={{
        p: 2.5,
        height: '100%',
        transition: 'box-shadow 160ms ease, transform 160ms ease',
        '&:hover': { boxShadow: SHADOWS.hover, transform: 'translateY(-2px)' },
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        {icon && (
          <Box
            sx={{
              display: 'flex',
              p: 1.25,
              borderRadius: 2.5,
              // A soft tint of the accent colour rather than a solid block --
              // easier on the eye and lets the headline number stay the focus.
              bgcolor: (theme) => alpha(theme.palette[color].main, 0.12),
              color: `${color}.main`,
            }}
            aria-hidden="true"
          >
            {icon}
          </Box>
        )}

        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" component="p">
            {label}
          </Typography>

          {loading ? (
            <Skeleton width={72} height={38} />
          ) : (
            <Typography
              variant="h1"
              component="p"
              // `emphasis` recolours the number itself when it is the thing
              // that needs attention -- an at-risk count of 0 should not shout.
              sx={{ lineHeight: 1.2, color: emphasis ? `${emphasis}.main` : 'text.primary' }}
            >
              {value}
            </Typography>
          )}

          {caption && (
            <Typography variant="caption" color="text.secondary">
              {caption}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

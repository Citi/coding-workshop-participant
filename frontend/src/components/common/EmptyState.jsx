import { Box, Stack, Typography } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

/**
 * What a collection shows when it has nothing in it.
 *
 * Separated from the table so "no records yet" and "no results for your
 * search" can read differently -- the first invites an action, the second
 * should suggest widening the filter rather than creating something.
 */
export default function EmptyState({ title, description, action, icon }) {
  return (
    <Stack alignItems="center" spacing={1.5} sx={{ py: 6, px: 3 }}>
      <Box sx={{ color: 'text.disabled', display: 'flex' }} aria-hidden="true">
        {icon ?? <InboxIcon sx={{ fontSize: 40 }} />}
      </Box>

      <Typography variant="h4" component="p" align="center">
        {title}
      </Typography>

      {description && (
        <Typography variant="body2" color="text.secondary" align="center" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}

      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  );
}

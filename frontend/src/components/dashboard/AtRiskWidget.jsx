import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useApi from '../../hooks/useApi';
import { getAtRiskProjects } from '../../services/reportService';
import StatusChip from '../common/StatusChip';
import { formatDate } from '../../utils/formatters';

/**
 * "Which projects are at risk of missing their deadlines?"
 *
 * The backend decides what counts as at risk and returns the reasons with each
 * row, so the rule lives in one place and every client agrees on it. This
 * component only presents the answer.
 */
export default function AtRiskWidget({ limit = 5 }) {
  const navigate = useNavigate();

  const { data, error, loading, refresh } = useApi(() => getAtRiskProjects({ limit }), {
    immediate: true,
    deps: [limit],
    initialData: [],
  });

  const projects = Array.isArray(data) ? data : [];

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <WarningAmberIcon color="warning" aria-hidden="true" />
        <Typography variant="h3" component="h3" sx={{ flexGrow: 1 }}>
          At risk
        </Typography>
        <Button size="small" component={RouterLink} to="/reports">
          View all
        </Button>
      </Stack>

      <Box sx={{ flexGrow: 1 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }} role="status">
            <CircularProgress size={28} aria-label="Loading at-risk projects" />
          </Box>
        )}

        {error && (
          <Alert
            severity="error"
            sx={{ m: 2 }}
            action={
              <Button color="inherit" size="small" onClick={refresh}>
                Retry
              </Button>
            }
          >
            {error.message}
          </Alert>
        )}

        {!loading && !error && projects.length === 0 && (
          <Typography color="text.secondary" align="center" sx={{ py: 5, px: 2 }}>
            No projects are currently at risk.
          </Typography>
        )}

        {!loading && !error && projects.length > 0 && (
          <List disablePadding>
            {projects.map((project, index) => (
              <Box key={project.id}>
                {index > 0 && <Divider component="li" />}
                <ListItemButton onClick={() => navigate(`/projects/${project.id}`)}>
                  <ListItemText
                    disableTypography
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="h5" component="span">
                          {project.name}
                        </Typography>
                        <StatusChip value={project.riskLevel} />
                      </Stack>
                    }
                    secondary={
                      <>
                        <Typography variant="body2" color="text.secondary">
                          Due {formatDate(project.endDate)}
                        </Typography>
                        <Stack
                          direction="row"
                          sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}
                        >
                          {(project.reasons ?? []).map((reason) => (
                            <Chip key={reason} label={reason} size="small" variant="outlined" />
                          ))}
                        </Stack>
                      </>
                    }
                  />
                </ListItemButton>
              </Box>
            ))}
          </List>
        )}
      </Box>
    </Paper>
  );
}

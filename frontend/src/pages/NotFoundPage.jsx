import { Link as RouterLink } from 'react-router-dom';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import EmptyState from '../components/EmptyState.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Shown for any route that does not exist.
 * @returns {JSX.Element} The page.
 */
export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Paper variant="outlined">
        <EmptyState
          icon={<SearchOffIcon />}
          title="We could not find that page"
          message="The address may be mistyped, or the page may have moved."
          action={
            <Button component={RouterLink} to="/" variant="contained">
              Go to the dashboard
            </Button>
          }
        />
      </Paper>
    </>
  );
}

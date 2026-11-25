import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import PageHeader from '../../components/PageHeader'
import { ErrorState, LoadingState } from '../../components/StateViews'
import { useApiQuery } from '../../hooks/useApiQuery'
import { projectsApi } from '../../services/projectsApi'
import BudgetByProjectTable from './BudgetByProjectTable'
import BudgetSummary from './BudgetSummary'
import ExpensesPanel from './ExpensesPanel'

const fetchProjects = () => projectsApi.list()

/** Budget consumed vs planned: portfolio totals, the per-project breakdown, then every expense. */
export default function BudgetPage() {
  const { data, loading, error, reload } = useApiQuery(fetchProjects)
  const projects = data?.items

  return (
    <>
      <PageHeader title="Budget" subtitle="Planned budget against money spent, per project and per expense" />
      {projects ? (
        <>
          <BudgetSummary projects={projects} />
          <Section
            id="budget-by-project-heading"
            title="Planned vs consumed by project"
            description="Highest share of the budget used first. Cancelled projects are not included."
          >
            <BudgetByProjectTable projects={projects} loading={loading} error={error} onRetry={reload} />
          </Section>
        </>
      ) : (
        <ProjectsLoadState error={error} onRetry={reload} />
      )}
      <Section id="budget-expenses-heading" title="Expenses" description="Every recorded expense. Filter by project, category or date.">
        <ExpensesPanel onChange={reload} />
      </Section>
    </>
  )
}

/** Shown until the projects (and so the budget figures) have loaded once. */
function ProjectsLoadState({ error, onRetry }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} title="Could not load the budget" />
  return <LoadingState label="Loading budget…" />
}

function Section({ id, title, description, children }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: 4 }}>
      <Typography id={id} variant="h6" component="h2">
        {title}
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      {children}
    </Box>
  )
}

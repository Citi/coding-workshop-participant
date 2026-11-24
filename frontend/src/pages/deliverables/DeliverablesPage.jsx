import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import DeliverablesPanel from './DeliverablesPanel'
import { filtersFromSearchParams } from './deliverableUtils'

function renderHeader(actions) {
  return (
    <PageHeader
      title="Deliverables"
      subtitle="Key deliverables, due dates and dependency chains across all projects"
      actions={actions}
    />
  )
}

/**
 * All deliverables across projects. Links can preselect filters, e.g. #/deliverables?is_key=true,
 * ?overdue=true or ?project_id=3 (the dashboard links here).
 */
export default function DeliverablesPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()
  // A new link (e.g. from the dashboard or the menu) starts the list again from its own filters.
  return <DeliverablesPanel key={query} initialFilters={filtersFromSearchParams(searchParams)} renderHeader={renderHeader} />
}

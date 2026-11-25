import PageHeader from '../../components/PageHeader'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import DeliverablesPanel from './DeliverablesPanel'
import { DELIVERABLE_URL_FILTERS, filtersFromSearchParams } from './deliverableUtils'

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
 * All deliverables across projects. The filters live in the URL, e.g. #/deliverables?is_key=true,
 * ?overdue=true or ?project_id=3 (the dashboard links here): a reload, Back and shared links keep
 * them, and a new link (the menu, the dashboard) or Back/Forward changes them.
 */
export default function DeliverablesPage() {
  const [filters, setFilters] = useUrlFilters(filtersFromSearchParams, DELIVERABLE_URL_FILTERS)
  return <DeliverablesPanel filters={filters} onFiltersChange={setFilters} renderHeader={renderHeader} />
}

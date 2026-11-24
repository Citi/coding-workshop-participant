import { useMemo } from 'react'
import { useApiQuery } from '../../hooks/useApiQuery'
import { projectsApi } from '../../services/projectsApi'

const fetchProjects = () => projectsApi.list()

/** Every project as a select option { value: id, label: name }, A-Z, for the expense filter and form. */
export function useProjectOptions() {
  const { data, error, reload } = useApiQuery(fetchProjects)
  const options = useMemo(
    () =>
      (data?.items || [])
        .map((project) => ({ value: project.id, label: project.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  )
  return { options, error, reload }
}

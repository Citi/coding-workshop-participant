// Resources endpoints (see docs/API.md): list(filters), get(id), create(data), update(id, data), remove(id)
import { createCrudApi } from './apiClient'

export const resourcesApi = createCrudApi('/resources')

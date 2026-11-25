// Users endpoints (see docs/API.md): list(filters), get(id), create(data), update(id, data), remove(id)
import { createCrudApi } from './apiClient'

export const usersApi = createCrudApi('/users')

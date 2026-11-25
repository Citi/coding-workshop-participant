// Portfolio overview: GET /dashboard (see docs/API.md for the response shape)
import { api } from './apiClient'

export const dashboardApi = {
  get: () => api.get('/dashboard'),
}

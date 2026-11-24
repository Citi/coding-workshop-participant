// Authentication endpoints. Login/refresh are public; me() needs a valid access token.
import { request } from './apiClient'

export const authApi = {
  login: (email, password) => request('POST', '/auth/login', { body: { email, password }, auth: false }),
  me: () => request('GET', '/auth/me'),
}

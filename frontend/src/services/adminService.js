import { apiRequest } from './apiClient';

// Facilities (admin). Reads include deactivated items so they can be restored.
export const getFacilitiesTree = () => apiRequest('/facilities', { params: { include_inactive: true } });

export const createBuilding = (body) => apiRequest('/buildings', { method: 'POST', body });
export const updateBuilding = (id, body) => apiRequest(`/buildings/${id}`, { method: 'PATCH', body });
export const deleteBuilding = (id) => apiRequest(`/buildings/${id}`, { method: 'DELETE' });

export const createFloor = (body) => apiRequest('/floors', { method: 'POST', body });
export const updateFloor = (id, body) => apiRequest(`/floors/${id}`, { method: 'PATCH', body });
export const deleteFloor = (id) => apiRequest(`/floors/${id}`, { method: 'DELETE' });

export const createSeat = (body) => apiRequest('/seats', { method: 'POST', body });
export const updateSeat = (id, body) => apiRequest(`/seats/${id}`, { method: 'PATCH', body });
export const deleteSeat = (id) => apiRequest(`/seats/${id}`, { method: 'DELETE' });

// Engineers (admin)
export const listEngineers = (includeInactive = false) =>
  apiRequest('/engineers', { params: { include_inactive: includeInactive || undefined } });
export const createEngineer = (body) => apiRequest('/engineers', { method: 'POST', body });
export const updateEngineer = (id, body) => apiRequest(`/engineers/${id}`, { method: 'PATCH', body });

// Engineer self-service
export const setMyAvailability = (availability) =>
  apiRequest('/engineers/me/availability', { method: 'PATCH', body: { availability } });

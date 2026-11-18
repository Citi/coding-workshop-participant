import { apiRequest } from './apiClient';

export const getDashboard = () => apiRequest('/dashboard');

export const getFacilities = () => apiRequest('/facilities');
export const getEngineers = () => apiRequest('/engineers');

// CRUD
export const listIncidents = (params) => apiRequest('/incidents', { params });
export const getIncident = (id) => apiRequest(`/incidents/${id}`);
export const createIncident = (body) => apiRequest('/incidents', { method: 'POST', body });
export const updateIncident = (id, body) => apiRequest(`/incidents/${id}`, { method: 'PATCH', body });
export const deleteIncident = (id) => apiRequest(`/incidents/${id}`, { method: 'DELETE' });

// Workflow actions (each returns the updated incident)
export const changeStatus = (id, status, comment) =>
  apiRequest(`/incidents/${id}/status`, { method: 'POST', body: { status, comment } });
export const assignEngineer = (id, engineerId) =>
  apiRequest(`/incidents/${id}/assign`, { method: 'POST', body: { engineer_id: engineerId } });
export const escalateIncident = (id, reason, requestedPriority) =>
  apiRequest(`/incidents/${id}/escalate`, {
    method: 'POST',
    body: { reason, requested_priority: requestedPriority || null },
  });
export const addNote = (id, body, isInternal = false) =>
  apiRequest(`/incidents/${id}/notes`, { method: 'POST', body: { body, is_internal: isInternal } });

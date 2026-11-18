import { apiRequest } from './apiClient';

// Fired whenever this tab changes read state, so the bell refreshes at once.
export const NOTIFICATIONS_CHANGED = 'notifications-changed';
const announce = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

export const listNotifications = (limit = 20) => apiRequest('/notifications', { params: { limit } });
export const getUnreadCount = () => apiRequest('/notifications/unread-count');

export async function markRead(id) {
  const r = await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
  announce();
  return r;
}

export async function markAllRead(incidentId) {
  const r = await apiRequest('/notifications/read-all', {
    method: 'POST',
    params: incidentId ? { incident_id: incidentId } : undefined,
  });
  announce();
  return r;
}

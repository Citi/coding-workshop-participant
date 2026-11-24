/**
 * Health check endpoint (public).
 */
import apiClient from './apiClient.js';

/**
 * Check that the service and its database answer.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{status: string, database: string, latency_ms: number}>} Health report.
 */
export function getHealth(options = {}) {
  return apiClient.get('/health', { ...options, auth: false });
}

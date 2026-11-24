/**
 * One import point for every API module, grouped by resource:
 * `import { projectsApi } from '../services';` then `projectsApi.listProjects(...)`.
 */
export * as allocationsApi from './allocations.js';
export * as analyticsApi from './analytics.js';
export * as auditLogsApi from './auditLogs.js';
export * as authApi from './auth.js';
export * as budgetEntriesApi from './budgetEntries.js';
export * as deliverablesApi from './deliverables.js';
export * as departmentsApi from './departments.js';
export * as dependenciesApi from './dependencies.js';
export * as healthApi from './health.js';
export * as projectsApi from './projects.js';
export * as usersApi from './users.js';
export { ApiError, isAbortError, isApiError } from './apiClient.js';

import * as allocations from './allocations.js';
import * as analytics from './analytics.js';
import * as auditLogs from './auditLogs.js';
import * as auth from './auth.js';
import * as budgetEntries from './budgetEntries.js';
import * as deliverables from './deliverables.js';
import * as departments from './departments.js';
import * as dependencies from './dependencies.js';
import * as health from './health.js';
import * as projects from './projects.js';
import * as users from './users.js';
import * as services from './index.js';
import { API_BASE_URL } from './apiClient.js';
import { setTokens } from '../auth/tokenStorage.js';

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async (url, init) =>
    init.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BODY = { name: 'x' };

// Every endpoint of spec section 8: [label, call, method, path after /api/portfolio, body].
const ENDPOINTS = [
  ['health', () => health.getHealth(), 'GET', '/health'],
  ['register', () => auth.register({ name: 'A', email: 'a@b.co', password: 'longenough', department_id: '3' }), 'POST', '/auth/register', { name: 'A', email: 'a@b.co', password: 'longenough', department_id: 3 }],
  ['register without department', () => auth.register({ name: 'A', email: 'a@b.co', password: 'longenough', department_id: '' }), 'POST', '/auth/register', { name: 'A', email: 'a@b.co', password: 'longenough' }],
  ['login', () => auth.login('a@b.co', 'secret-pass'), 'POST', '/auth/login', { email: 'a@b.co', password: 'secret-pass' }],
  ['refresh', () => auth.refresh('refresh-1'), 'POST', '/auth/refresh', { refresh_token: 'refresh-1' }],
  ['me', () => auth.getMe(), 'GET', '/auth/me'],
  ['list users', () => users.listUsers({ q: 'priya', role: 'LEAD', department_id: 1 }), 'GET', '/users?q=priya&role=LEAD&department_id=1'],
  ['get user', () => users.getUser(5), 'GET', '/users/5'],
  ['create user', () => users.createUser(BODY), 'POST', '/users', BODY],
  ['update user', () => users.updateUser(5, { role: 'PM' }), 'PUT', '/users/5', { role: 'PM' }],
  ['delete user', () => users.deleteUser(5), 'DELETE', '/users/5'],
  ['list departments', () => departments.listDepartments({ limit: 200 }), 'GET', '/departments?limit=200'],
  ['get department', () => departments.getDepartment(2), 'GET', '/departments/2'],
  ['create department', () => departments.createDepartment(BODY), 'POST', '/departments', BODY],
  ['update department', () => departments.updateDepartment(2, BODY), 'PUT', '/departments/2', BODY],
  ['delete department', () => departments.deleteDepartment(2), 'DELETE', '/departments/2'],
  ['list projects', () => projects.listProjects({ q: 'alpha', department_id: 1, status: 'ACTIVE', risk_level: 'CRITICAL' }), 'GET', '/projects?q=alpha&department_id=1&status=ACTIVE&risk_level=CRITICAL'],
  ['get project', () => projects.getProject(1), 'GET', '/projects/1'],
  ['create project', () => projects.createProject(BODY), 'POST', '/projects', BODY],
  ['update project', () => projects.updateProject(1, BODY), 'PUT', '/projects/1', BODY],
  ['delete project', () => projects.deleteProject(1), 'DELETE', '/projects/1'],
  ['project risk', () => projects.getProjectRisk(1, { as_of: '2026-11-25' }), 'GET', '/projects/1/risk?as_of=2026-11-25'],
  ['dependency graph', () => projects.getProjectDependencyGraph(1), 'GET', '/projects/1/dependency-graph'],
  ['list deliverables', () => deliverables.listDeliverables({ project_id: 1, status: 'BLOCKED', assigned_user_id: 5, overdue: true, q: 'api' }), 'GET', '/deliverables?project_id=1&status=BLOCKED&assigned_user_id=5&overdue=true&q=api'],
  ['get deliverable', () => deliverables.getDeliverable(2), 'GET', '/deliverables/2'],
  ['create deliverable', () => deliverables.createDeliverable(BODY), 'POST', '/deliverables', BODY],
  ['update deliverable', () => deliverables.updateDeliverable(2, BODY), 'PUT', '/deliverables/2', BODY],
  ['delete deliverable', () => deliverables.deleteDeliverable(2), 'DELETE', '/deliverables/2'],
  ['deliverable impact', () => deliverables.getDeliverableImpact(2), 'GET', '/deliverables/2/impact'],
  ['list dependencies', () => dependencies.listDependencies({ project_id: 1 }), 'GET', '/dependencies?project_id=1'],
  ['create dependency', () => dependencies.createDependency({ predecessor_deliverable_id: 5, successor_deliverable_id: 2 }), 'POST', '/dependencies', { predecessor_deliverable_id: 5, successor_deliverable_id: 2 }],
  ['delete dependency', () => dependencies.deleteDependency(9), 'DELETE', '/dependencies/9'],
  ['list allocations', () => allocations.listAllocations({ user_id: 5, project_id: 1 }), 'GET', '/allocations?user_id=5&project_id=1'],
  ['get allocation', () => allocations.getAllocation(3), 'GET', '/allocations/3'],
  ['create allocation', () => allocations.createAllocation(BODY), 'POST', '/allocations', BODY],
  ['update allocation', () => allocations.updateAllocation(3, BODY), 'PUT', '/allocations/3', BODY],
  ['delete allocation', () => allocations.deleteAllocation(3), 'DELETE', '/allocations/3'],
  ['list budget entries', () => budgetEntries.listBudgetEntries({ project_id: 1, category: 'LABOR' }), 'GET', '/budget-entries?project_id=1&category=LABOR'],
  ['get budget entry', () => budgetEntries.getBudgetEntry(4), 'GET', '/budget-entries/4'],
  ['create budget entry', () => budgetEntries.createBudgetEntry(BODY), 'POST', '/budget-entries', BODY],
  ['update budget entry', () => budgetEntries.updateBudgetEntry(4, BODY), 'PUT', '/budget-entries/4', BODY],
  ['delete budget entry', () => budgetEntries.deleteBudgetEntry(4), 'DELETE', '/budget-entries/4'],
  ['dashboard', () => analytics.getDashboard(), 'GET', '/analytics/dashboard'],
  ['capacity', () => analytics.getCapacity({ department_id: 1, from: '2026-11-01', to: '2026-12-31' }), 'GET', '/analytics/capacity?department_id=1&from=2026-11-01&to=2026-12-31'],
  ['budget analytics', () => analytics.getBudgetAnalytics(), 'GET', '/analytics/budget'],
  ['risk analytics', () => analytics.getRiskAnalytics({ as_of: '2026-11-25' }), 'GET', '/analytics/risk?as_of=2026-11-25'],
  ['audit logs', () => auditLogs.listAuditLogs({ entity_type: 'project', entity_id: 1, actor_id: 2 }), 'GET', '/audit-logs?entity_type=project&entity_id=1&actor_id=2'],
];

describe('service modules cover every API endpoint', () => {
  it.each(ENDPOINTS)('%s', async (_, call, method, path, body) => {
    await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe(method);
    expect(url).toBe(`${API_BASE_URL}${path}`);
    if (body === undefined) {
      expect(init.body).toBeUndefined();
    } else {
      expect(JSON.parse(init.body)).toEqual(body);
    }
  });

  it('sends no token to the public endpoints', async () => {
    await health.getHealth();
    await auth.login('a@b.co', 'secret-pass');
    await auth.register({ name: 'A', email: 'a@b.co', password: 'longenough' });
    await auth.refresh('refresh-1');

    fetchMock.mock.calls.forEach(([, init]) => expect(init.headers.Authorization).toBeUndefined());
  });

  it('encodes ids so they cannot change the path', async () => {
    await projects.getProject('1/../users');

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/projects/1%2F..%2Fusers`);
  });

  it('passes an AbortSignal through', async () => {
    const controller = new AbortController();
    await projects.listProjects({}, { signal: controller.signal });

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('groups every module in the services index', () => {
    expect(Object.keys(services).sort()).toEqual([
      'ApiError',
      'allocationsApi',
      'analyticsApi',
      'auditLogsApi',
      'authApi',
      'budgetEntriesApi',
      'deliverablesApi',
      'departmentsApi',
      'dependenciesApi',
      'healthApi',
      'isAbortError',
      'isApiError',
      'projectsApi',
      'usersApi',
    ]);
  });
});

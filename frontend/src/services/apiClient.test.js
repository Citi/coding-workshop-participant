import apiClient, {
  API_BASE_URL,
  ApiError,
  GET_RETRY_DELAY_MS,
  buildUrl,
  isApiError,
  refreshAccessToken,
  request,
  resolveApiBase,
  setAuthFailureHandler,
} from './apiClient.js';
import { getAccessToken, getRefreshToken, getStoredUser, setStoredUser, setTokens } from '../auth/tokenStorage.js';
import { htmlResponse, jsonResponse } from '../test/utils.jsx';

let fetchMock;
let onAuthFailure;

function callAt(index) {
  const [url, init] = fetchMock.mock.calls[index];
  return { url, init };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  onAuthFailure = vi.fn();
  setAuthFailureHandler(onAuthFailure);
  setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  setAuthFailureHandler(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('base URL', () => {
  it('appends /api/portfolio and strips one trailing slash', () => {
    expect(resolveApiBase('http://localhost:3001')).toBe('http://localhost:3001/api/portfolio');
    expect(resolveApiBase('https://d111.cloudfront.net/')).toBe('https://d111.cloudfront.net/api/portfolio');
    expect(resolveApiBase('')).toBe('/api/portfolio');
    expect(resolveApiBase(undefined)).toBe('/api/portfolio');
  });

  it('builds query strings and skips empty values', () => {
    expect(buildUrl('/projects', { q: '', status: 'ACTIVE', department_id: null, limit: 25, offset: 0 })).toBe(
      `${API_BASE_URL}/projects?status=ACTIVE&limit=25&offset=0`,
    );
    expect(buildUrl('deliverables', { overdue: true })).toBe(`${API_BASE_URL}/deliverables?overdue=true`);
  });
});

describe('auth header', () => {
  it('sends the access token from sessionStorage as a Bearer header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }));

    const data = await apiClient.get('/projects', { params: { status: 'ACTIVE' } });

    expect(data).toEqual({ items: [], total: 0 });
    const { url, init } = callAt(0);
    expect(url).toBe(`${API_BASE_URL}/projects?status=ACTIVE`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer access-1');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.body).toBeUndefined();
  });

  it('sends a JSON body with a content type on POST and PUT', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 7 }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 7, project_name: 'B' }));

    await apiClient.post('/projects', { project_name: 'A' });
    await apiClient.put('/projects/7', { project_name: 'B' });

    expect(callAt(0).init.method).toBe('POST');
    expect(callAt(0).init.headers['Content-Type']).toBe('application/json');
    expect(callAt(0).init.body).toBe(JSON.stringify({ project_name: 'A' }));
    expect(callAt(1).init.method).toBe('PUT');
    expect(callAt(1).url).toBe(`${API_BASE_URL}/projects/7`);
  });

  it('sends no Authorization header when signed out or for public endpoints', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { status: 'healthy' }));

    await apiClient.get('/health', { auth: false });
    window.sessionStorage.clear();
    await apiClient.get('/health');

    expect(callAt(0).init.headers.Authorization).toBeUndefined();
    expect(callAt(1).init.headers.Authorization).toBeUndefined();
  });
});

describe('401 handling', () => {
  it('refreshes the token once and retries the request with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Token expired.' }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2', token_type: 'bearer', expires_in: 1800 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, project_name: 'Alpha' }));

    const data = await apiClient.get('/projects/1');

    expect(data).toEqual({ id: 1, project_name: 'Alpha' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshCall = callAt(1);
    expect(refreshCall.url).toBe(`${API_BASE_URL}/auth/refresh`);
    expect(refreshCall.init.method).toBe('POST');
    expect(JSON.parse(refreshCall.init.body)).toEqual({ refresh_token: 'refresh-1' });
    expect(refreshCall.init.headers.Authorization).toBeUndefined();
    expect(callAt(2).init.headers.Authorization).toBe('Bearer access-2');
    expect(getAccessToken()).toBe('access-2');
    expect(getRefreshToken()).toBe('refresh-1');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it('signs out and redirects to /login when the refresh fails', async () => {
    setStoredUser({ id: 1, role: 'PM' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Token expired.' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Refresh token expired.' }));

    const error = await apiClient.get('/projects').catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, error: 'UNAUTHENTICATED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it('signs out without calling refresh when there is no refresh token', async () => {
    window.sessionStorage.clear();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Missing token.' }));

    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('retries only once: a second 401 after refreshing signs out', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2' }))
      .mockResolvedValueOnce(jsonResponse(401, {}));

    await expect(apiClient.get('/projects')).rejects.toMatchObject({ status: 401, error: 'UNAUTHENTICATED' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh call between concurrent requests', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(200, { access_token: 'access-2' });
      }
      return init.headers.Authorization === 'Bearer access-2'
        ? jsonResponse(200, { url })
        : jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Token expired.' });
    });

    const results = await Promise.all([apiClient.get('/projects'), apiClient.get('/deliverables')]);

    expect(results.map((result) => result.url)).toEqual([
      `${API_BASE_URL}/projects`,
      `${API_BASE_URL}/deliverables`,
    ]);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('does not refresh for public auth calls such as a failed login', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Invalid email or password.', details: [] }),
    );

    const error = await apiClient
      .post('/auth/login', { email: 'pm@acme.example', password: 'wrong-password' }, { auth: false })
      .catch((caught) => caught);

    expect(error).toMatchObject({ status: 401, message: 'Invalid email or password.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('access-1');
  });

  it('reports false from refreshAccessToken when the server rejects it', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(200));
    await expect(refreshAccessToken()).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(refreshAccessToken()).resolves.toBe(false);
  });

  it('stores a rotated refresh token when the server sends one', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-9', refresh_token: 'refresh-9' }));
    await expect(refreshAccessToken()).resolves.toBe(true);
    expect(getAccessToken()).toBe('access-9');
    expect(getRefreshToken()).toBe('refresh-9');
  });
});

describe('response handling', () => {
  it('treats a text/html response as 404 NOT_FOUND (CloudFront SPA fallback)', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(200));

    const error = await apiClient.get('/projects/999999').catch((caught) => caught);

    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 404, error: 'NOT_FOUND' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('also treats an HTML 404 page as NOT_FOUND', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(404));
    await expect(apiClient.delete('/projects/5')).rejects.toMatchObject({ status: 404, error: 'NOT_FOUND' });
  });

  it('keeps an HTML 5xx gateway page as a server error, not a 404', async () => {
    fetchMock.mockImplementation(async () => htmlResponse(504));

    await expect(apiClient.post('/projects', {})).rejects.toMatchObject({ status: 504, error: 'INTERNAL_ERROR' });
  });

  it('returns null for 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(apiClient.delete('/projects/5')).resolves.toBeNull();
    expect(callAt(0).init.method).toBe('DELETE');
  });

  it('throws a typed ApiError with status, error, message and details', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'The request is not valid.',
        details: [
          { field: 'email', issue: 'value is not a valid email address' },
          { field: 'email', issue: 'second issue is ignored' },
          { field: 'name', issue: 'Field required' },
        ],
      }),
    );

    const error = await apiClient.post('/users', { email: 'x' }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(400);
    expect(error.error).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('The request is not valid.');
    expect(error.details).toHaveLength(3);
    expect(error.fieldErrors).toEqual({ email: 'value is not a valid email address', name: 'Field required' });
  });

  it('fills in a code and message when the error body is empty', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(apiClient.delete('/projects/1')).rejects.toMatchObject({
      status: 403,
      error: 'ACCESS_DENIED',
      message: 'You do not have permission to do that.',
      details: [],
    });
  });

  it('rejects a successful response whose body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } }));
    await expect(apiClient.post('/projects', {})).rejects.toMatchObject({ error: 'INVALID_RESPONSE' });
  });
});

describe('GET retry on network errors and 5xx', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('waits 3 seconds and retries a GET once after a 5xx', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { error: 'SERVICE_UNAVAILABLE', message: 'Database resuming.' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'healthy' }));

    const pending = apiClient.get('/health');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(GET_RETRY_DELAY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ status: 'healthy' });
    expect(GET_RETRY_DELAY_MS).toBe(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Deliberate deviation from spec 12.2 (see README): an HTML 5xx is CloudFront's own gateway
  // error page, not the SPA fallback, so it is retried instead of being reported as 404.
  it('retries a GET once after an HTML 5xx gateway page', async () => {
    fetchMock
      .mockResolvedValueOnce(htmlResponse(502))
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, project_name: 'Alpha' }));

    const pending = apiClient.get('/projects/1');
    await vi.advanceTimersByTimeAsync(GET_RETRY_DELAY_MS);

    await expect(pending).resolves.toEqual({ id: 1, project_name: 'Alpha' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a GET once after a network error', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }));

    const pending = apiClient.get('/projects');
    await vi.advanceTimersByTimeAsync(GET_RETRY_DELAY_MS);

    await expect(pending).resolves.toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry and throws the server error', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(502, { error: 'Bad Gateway', message: 'read ECONNRESET' }));

    const pending = apiClient.get('/projects').catch((caught) => caught);
    await vi.advanceTimersByTimeAsync(GET_RETRY_DELAY_MS);
    const error = await pending;

    expect(error).toMatchObject({ status: 502, message: 'read ECONNRESET' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a network error with status 0 when the retry also fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const pending = apiClient.get('/projects').catch((caught) => caught);
    await vi.advanceTimersByTimeAsync(GET_RETRY_DELAY_MS);

    await expect(pending).resolves.toMatchObject({ status: 0, error: 'NETWORK_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries writes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'INTERNAL_ERROR', message: 'Boom.' }));
    await expect(apiClient.post('/projects', {})).rejects.toMatchObject({ status: 500, error: 'INTERNAL_ERROR' });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(request('PUT', '/projects/1', { body: {} })).rejects.toMatchObject({ error: 'NETWORK_ERROR' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops waiting when the request is aborted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, {}));
    const controller = new AbortController();

    const pending = apiClient.get('/projects', { signal: controller.signal }).catch((caught) => caught);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const error = await pending;

    expect(error.name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

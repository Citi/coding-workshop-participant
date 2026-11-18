import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/mockApi';
import { ApiError, apiRequest, saveSession, setUnauthorizedHandler } from './apiClient';

describe('apiRequest', () => {
  it('sends JSON with the bearer token and returns the parsed body', async () => {
    saveSession('tok-123', { id: 1 });
    const api = mockApi({ 'POST /incidents': (body) => ({ id: 9, ...body }) });

    const result = await apiRequest('/incidents', { method: 'POST', body: { title: 'Leak' } });

    expect(result).toEqual({ id: 9, title: 'Leak' });
    expect(api.calls[0].headers).toMatchObject({
      Authorization: 'Bearer tok-123',
      'Content-Type': 'application/json',
    });
  });

  it('builds query strings, repeating arrays and skipping empty values', async () => {
    const api = mockApi({ 'GET /incidents': { items: [], total: 0 } });
    await apiRequest('/incidents', { params: { status: ['open', 'assigned'], q: '', priority: null, limit: 20 } });
    const { query } = api.calls[0];
    expect(query.getAll('status')).toEqual(['open', 'assigned']);
    expect(query.has('q')).toBe(false);
    expect(query.has('priority')).toBe(false);
    expect(query.get('limit')).toBe('20');
  });

  it('returns null for 204 No Content', async () => {
    mockApi({ 'DELETE /incidents/4': { status: 204, body: null } });
    await expect(apiRequest('/incidents/4', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('throws ApiError with the server message and status', async () => {
    mockApi({ 'GET /incidents/99': { status: 404, body: { message: 'Incident not found.' } } });
    const err = await apiRequest('/incidents/99').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Incident not found.');
  });

  it('falls back to a friendly message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(apiRequest('/dashboard')).rejects.toThrow('Something went wrong. Please try again.');
  });

  it('reports network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await apiRequest('/dashboard').catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Cannot reach the server/);
  });

  it('signs the user out on 401 only when they had a session', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockApi({ 'POST /auth/login': { status: 401, body: { message: 'Invalid email or password.' } },
              'GET /dashboard': { status: 401, body: { message: 'Your session has expired.' } } });

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toThrow('Invalid email');
    expect(onUnauthorized).not.toHaveBeenCalled(); // wrong password is not an expired session

    saveSession('old-token', { id: 1 });
    await expect(apiRequest('/dashboard')).rejects.toThrow('expired');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(() => {});
  });
});

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  api, ApiError, loadSession, saveSession, setSessionExpiredHandler,
} from '../services/api';
import { jsonResponse } from '../test/utils';

describe('api client', () => {
  beforeEach(() => {
    saveSession({ access_token: 'old', refresh_token: 'refresh', user: { id: 1 } });
  });

  it('sends the bearer token and query string', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, [{ id: 1 }]));
    const data = await api.get('/projects', { status: 'active', search: '' });
    expect(data).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/tracker\/projects\?status=active$/);
    expect(init.headers.Authorization).toBe('Bearer old');
  });

  it('refreshes an expired token once and retries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'new', refresh_token: 'r2', user: { id: 1 } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await expect(api.get('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
    expect(loadSession().access_token).toBe('new');
  });

  it('signs out when the refresh token is rejected', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: 'bad refresh' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: 'expired' } }));
    await expect(api.get('/projects')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalled();
    expect(loadSession()).toBeNull();
  });

  it('maps API errors with field details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(400, {
      error: { code: 'validation_error', message: 'Fix fields', details: { name: 'Required' } },
    }));
    const err = await api.post('/projects', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ name: 'Required' });
  });

  it('reports network failures in plain language', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await api.get('/projects').catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/could not reach the server/i);
  });

  it('returns null for 204 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(204));
    await expect(api.del('/projects/1')).resolves.toBeNull();
  });
});

import { useCallback } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Context as ResponsiveContext } from 'react-responsive';
import useApi, { dependencyKey } from './useApi.js';
import useDebouncedValue from './useDebouncedValue.js';
import useIsMobile, { MOBILE_MAX_WIDTH } from './useIsMobile.js';
import usePagination from './usePagination.js';
import { ApiError } from '../services/apiClient.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useApi', () => {
  it('loads data and reports loading until it arrives', async () => {
    const loader = vi.fn(async () => ({ items: [1, 2], total: 2 }));
    const { result } = renderHook(() => useApi(loader, []));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ items: [1, 2], total: 2 });
    expect(result.current.error).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });

  it('accepts an inline loader without re-running on every render', async () => {
    let calls = 0;
    const { result, rerender } = renderHook(({ q }) =>
      useApi(async () => {
        calls += 1;
        return `result for ${q}`;
      }, [q]),
    { initialProps: { q: 'alpha' } });

    await waitFor(() => expect(result.current.data).toBe('result for alpha'));
    rerender({ q: 'alpha' });
    rerender({ q: 'alpha' });
    await act(async () => {});
    expect(calls).toBe(1);

    rerender({ q: 'beta' });
    await waitFor(() => expect(result.current.data).toBe('result for beta'));
    expect(calls).toBe(2);
  });

  it('compares dependency objects by content', async () => {
    const loader = vi.fn(async () => 'ok');
    const { result, rerender } = renderHook(({ params }) => useApi(loader, [params]), {
      initialProps: { params: { status: 'ACTIVE' } },
    });
    await waitFor(() => expect(result.current.data).toBe('ok'));

    rerender({ params: { status: 'ACTIVE' } });
    await act(async () => {});
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous data while reloading', async () => {
    let calls = 0;
    const next = deferred();
    const loader = vi.fn(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve('first') : next.promise;
    });
    const { result } = renderHook(() => useApi(loader, []));
    await waitFor(() => expect(result.current.data).toBe('first'));

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('first');

    await act(async () => next.resolve('second'));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('second');
  });

  it('cancels a superseded request and ignores its late result', async () => {
    const slow = deferred();
    const fast = deferred();
    const loader = vi.fn((signal, id) => (id === 1 ? slow.promise : fast.promise));
    const { result, rerender } = renderHook(({ id }) => useApi((signal) => loader(signal, id), [id]), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    const firstSignal = loader.mock.calls[0][0];

    rerender({ id: 2 });
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);

    await act(async () => fast.resolve('fresh'));
    await act(async () => slow.resolve('stale'));
    expect(result.current.data).toBe('fresh');
  });

  it('reports errors but not aborts', async () => {
    const failure = new ApiError({ status: 500, error: 'INTERNAL_ERROR', message: 'Boom.' });
    const { result } = renderHook(() => useApi(async () => Promise.reject(failure), []));

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.loading).toBe(false);

    const aborted = renderHook(() =>
      useApi(async () => Promise.reject(new DOMException('Aborted', 'AbortError')), []),
    );
    await act(async () => {});
    expect(aborted.result.current.error).toBeNull();
  });

  it('does nothing while disabled and supports local updates', async () => {
    const loader = vi.fn(async () => [1]);
    const { result, rerender } = renderHook(({ enabled }) => useApi(loader, [], { enabled }), {
      initialProps: { enabled: false },
    });
    expect(result.current.loading).toBe(false);
    expect(loader).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual([1]));
    act(() => result.current.setData((data) => [...data, 2]));
    expect(result.current.data).toEqual([1, 2]);
    act(() => result.current.setData([]));
    expect(result.current.data).toEqual([]);
  });

  it('falls back to a string key for values JSON cannot encode', async () => {
    const loader = vi.fn(async () => 'ok');
    const { result } = renderHook(() => useApi(loader, [10n]));

    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  // JSON.stringify used to turn every function into null, so a memoised loader listed as the
  // dependency never triggered a new request and filter pages kept showing stale data.
  it('refetches when a useCallback loader listed as the dependency changes', async () => {
    const listProjects = vi.fn(async (params) => `status=${params.status}`);
    const { result, rerender } = renderHook(
      ({ status }) => {
        const load = useCallback((signal) => listProjects({ status }, { signal }), [status]);
        return useApi(load, [load]);
      },
      { initialProps: { status: '' } },
    );
    await waitFor(() => expect(result.current.data).toBe('status='));

    rerender({ status: '' });
    await act(async () => {});
    expect(listProjects).toHaveBeenCalledTimes(1);

    rerender({ status: 'ACTIVE' });
    await waitFor(() => expect(result.current.data).toBe('status=ACTIVE'));
    expect(listProjects.mock.calls.map(([params]) => params.status)).toEqual(['', 'ACTIVE']);
  });

  it('refetches when an inline loader wraps a memoised function listed as the dependency', async () => {
    const listProjects = vi.fn(async (params) => `status=${params.status}`);
    const { result, rerender } = renderHook(
      ({ status }) => {
        const loadProjects = useCallback((signal) => listProjects({ status }, { signal }), [status]);
        return useApi((signal) => loadProjects(signal), [loadProjects]);
      },
      { initialProps: { status: '' } },
    );
    await waitFor(() => expect(result.current.data).toBe('status='));

    rerender({ status: 'ACTIVE' });
    await waitFor(() => expect(result.current.data).toBe('status=ACTIVE'));
    expect(listProjects).toHaveBeenCalledTimes(2);
  });
});

describe('dependencyKey', () => {
  it('compares plain data by content', () => {
    expect(dependencyKey([{ status: 'ACTIVE', ids: [1, 2] }, 'q', 3, true, null])).toBe(
      dependencyKey([{ status: 'ACTIVE', ids: [1, 2] }, 'q', 3, true, null]),
    );
    expect(dependencyKey([{ status: 'ACTIVE' }])).not.toBe(dependencyKey([{ status: 'ON_HOLD' }]));
    expect(dependencyKey([new Date('2026-11-25')])).toBe(dependencyKey([new Date('2026-11-25')]));
    expect(dependencyKey([new Date('2026-11-25')])).not.toBe(dependencyKey([new Date('2026-11-26')]));
    expect(dependencyKey([Object.create(null)])).toBe(dependencyKey([{}]));
  });

  it('compares functions by identity, wherever they appear', () => {
    const first = () => 'same source';
    const second = () => 'same source';
    expect(dependencyKey([first])).toBe(dependencyKey([first]));
    expect(dependencyKey([first])).not.toBe(dependencyKey([second]));
    expect(dependencyKey([{ onLoad: first }])).not.toBe(dependencyKey([{ onLoad: second }]));
    expect(dependencyKey([first])).not.toBe(dependencyKey([null]));
  });

  it('compares Maps, Sets and class instances by identity', () => {
    const map = new Map([['a', 1]]);
    const params = new URLSearchParams('status=ACTIVE');
    class Filter {
      constructor(status) {
        this.status = status;
      }
    }
    const filter = new Filter('ACTIVE');
    expect(dependencyKey([map])).toBe(dependencyKey([map]));
    expect(dependencyKey([map])).not.toBe(dependencyKey([new Map([['a', 1]])]));
    expect(dependencyKey([new Set([1])])).not.toBe(dependencyKey([new Set([1])]));
    expect(dependencyKey([params])).toBe(dependencyKey([params]));
    expect(dependencyKey([params])).not.toBe(dependencyKey([new URLSearchParams('status=ACTIVE')]));
    expect(dependencyKey([filter])).not.toBe(dependencyKey([new Filter('ACTIVE')]));
    expect(dependencyKey([map])).not.toBe(dependencyKey([{}]));
  });

  it('tells apart values JSON would merge', () => {
    expect(dependencyKey([undefined])).not.toBe(dependencyKey([null]));
    expect(dependencyKey([Number.NaN])).not.toBe(dependencyKey([null]));
    expect(dependencyKey([Infinity])).not.toBe(dependencyKey([-Infinity]));
    expect(dependencyKey([10n])).toBe(dependencyKey([10n]));
    expect(dependencyKey([10n])).not.toBe(dependencyKey([11n]));
    expect(dependencyKey([10n])).not.toBe(dependencyKey(['10']));
    expect(dependencyKey(['a', 'b'])).not.toBe(dependencyKey(['a,b']));
    const token = Symbol('token');
    expect(dependencyKey([token])).toBe(dependencyKey([token]));
    expect(dependencyKey([token])).not.toBe(dependencyKey([Symbol('token')]));
  });

  it('compares circular objects by identity instead of throwing', () => {
    const node = { id: 1 };
    node.self = node;
    const twin = { id: 1 };
    twin.self = twin;
    expect(dependencyKey([node])).toBe(dependencyKey([node]));
    expect(dependencyKey([node])).not.toBe(dependencyKey([twin]));
  });
});

describe('useIsMobile', () => {
  function wrapperFor(width) {
    return function Wrapper({ children }) {
      return <ResponsiveContext.Provider value={{ width }}>{children}</ResponsiveContext.Provider>;
    };
  }

  it('is true up to 899px and false from 900px', () => {
    expect(MOBILE_MAX_WIDTH).toBe(899);
    expect(renderHook(() => useIsMobile(), { wrapper: wrapperFor(375) }).result.current).toBe(true);
    expect(renderHook(() => useIsMobile(), { wrapper: wrapperFor(899) }).result.current).toBe(true);
    expect(renderHook(() => useIsMobile(), { wrapper: wrapperFor(900) }).result.current).toBe(false);
  });
});

describe('useDebouncedValue', () => {
  it('settles after the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('ab');
    vi.useRealTimers();
  });
});

describe('usePagination', () => {
  it('turns page and page size into limit and offset', () => {
    const { result } = renderHook(() => usePagination(10));
    expect(result.current).toMatchObject({ page: 0, rowsPerPage: 10, limit: 10, offset: 0 });

    act(() => result.current.setPage(2));
    expect(result.current.offset).toBe(20);

    act(() => result.current.setRowsPerPage(50));
    expect(result.current).toMatchObject({ page: 0, limit: 50, offset: 0 });

    act(() => result.current.setPage(3));
    act(() => result.current.reset());
    expect(result.current.page).toBe(0);
  });
});

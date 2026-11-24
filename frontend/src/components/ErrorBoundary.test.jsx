import { Suspense, lazy, useState } from 'react';
import { screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary.jsx';
import { lazyPage } from '../utils/lazyPage.js';
import { renderWithProviders } from '../test/utils.jsx';

let shouldThrow = true;

function Fragile() {
  const [label] = useState('Recovered content');
  if (shouldThrow) {
    throw new Error('render failure');
  }
  return <p>{label}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows a fallback instead of a blank page and can retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderWithProviders(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    );

    expect(screen.getByText('This page failed to load')).toBeInTheDocument();
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });

  // React.lazy caches a failed import, so re-rendering can never load the page again; after
  // a redeploy removed the old code files, only a full reload recovers.
  it('reloads the app when a lazy page’s code file failed to download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    let attempts = 0;
    const Page = lazyPage(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/BudgetPage-old.js'))
        : Promise.resolve({ default: () => <p>page loaded</p> });
    });
    const { user } = renderWithProviders(
      <ErrorBoundary>
        <Suspense fallback={<p>loading</p>}>
          <Page />
        </Suspense>
      </ErrorBoundary>,
    );

    expect(await screen.findByText('This page could not be loaded')).toBeInTheDocument();
    expect(screen.getByText(/may have been updated since this tab was opened/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(1);
  });

  it('recognises a browser chunk-load error from a plain React.lazy too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const Chart = lazy(() =>
      Promise.reject(new TypeError('error loading dynamically imported module: /assets/Chart-old.js')),
    );
    const { user } = renderWithProviders(
      <ErrorBoundary>
        <Suspense fallback={null}>
          <Chart />
        </Suspense>
      </ErrorBoundary>,
    );

    await user.click(await screen.findByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

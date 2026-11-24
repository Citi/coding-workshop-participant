import { Component, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { CHUNK_LOAD_ERROR, isChunkLoadError, lazyPage, reloadPage } from './lazyPage.js';

class Catch extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    this.props.onError(error);
  }

  render() {
    return this.state.error ? <p>caught {this.state.error.name}</p> : this.props.children;
  }
}

function renderLazy(Page) {
  let caught = null;
  render(
    <Catch
      onError={(error) => {
        caught = error;
      }}
    >
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>
    </Catch>,
  );
  return () => caught;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://d111.cloudfront.net/assets/BudgetPage-abc.js',
    'error loading dynamically imported module: https://d111.cloudfront.net/assets/BudgetPage-abc.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/BudgetPage-abc.css',
    'Loading chunk 42 failed.',
  ])('recognises "%s"', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('recognises the ChunkLoadError name and nothing else', () => {
    const named = new Error('anything');
    named.name = CHUNK_LOAD_ERROR;
    expect(isChunkLoadError(named)).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'items')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
    expect(isChunkLoadError({ message: 42 })).toBe(false);
  });
});

describe('lazyPage', () => {
  it('renders the page once its code has loaded', async () => {
    const Page = lazyPage(async () => ({ default: () => <p>Budget page</p> }));
    renderLazy(Page);
    expect(await screen.findByText('Budget page')).toBeInTheDocument();
  });

  it('rethrows a failed import as a ChunkLoadError that keeps the cause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new TypeError('Failed to fetch dynamically imported module: /assets/RiskPage-old.js');
    const caught = renderLazy(lazyPage(() => Promise.reject(cause)));

    expect(await screen.findByText('caught ChunkLoadError')).toBeInTheDocument();
    expect(caught().cause).toBe(cause);
    expect(caught().message).toBe(
      "The page's code could not be downloaded: Failed to fetch dynamically imported module: /assets/RiskPage-old.js",
    );
    expect(isChunkLoadError(caught())).toBe(true);
  });

  it('wraps a rejection that is not an Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const caught = renderLazy(lazyPage(() => Promise.reject('offline')));

    expect(await screen.findByText('caught ChunkLoadError')).toBeInTheDocument();
    expect(caught().message).toBe("The page's code could not be downloaded");
    expect(caught().cause).toBe('offline');
  });
});

describe('reloadPage', () => {
  it('reloads the current URL', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    reloadPage();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

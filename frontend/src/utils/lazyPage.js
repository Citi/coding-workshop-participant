/**
 * Lazy loading for route pages that recognises a page whose code file failed to download.
 *
 * A redeploy (`aws s3 sync --delete` in bin/deploy-frontend.sh) replaces the hashed code
 * files, so a tab opened before the deploy cannot download pages it has not loaded yet.
 * React.lazy caches the failed import, so rendering the page again fails the same way; only
 * a full page reload (new index.html, new file names) recovers.
 */
import { lazy } from 'react';

/** `name` of the error thrown when a page's code file cannot be downloaded. */
export const CHUNK_LOAD_ERROR = 'ChunkLoadError';

// Messages browsers and bundlers use when a dynamic import fails.
const CHUNK_LOAD_MESSAGES = [
  /failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite's preload helper
  /loading (css )?chunk \S+ failed/i, // webpack-style bundlers
];

/**
 * Whether an error means a page's code file could not be downloaded.
 * @param {unknown} error - Anything thrown while rendering.
 * @returns {boolean} True for failed dynamic imports.
 */
export function isChunkLoadError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if (error.name === CHUNK_LOAD_ERROR) {
    return true;
  }
  const message = typeof error.message === 'string' ? error.message : '';
  return CHUNK_LOAD_MESSAGES.some((pattern) => pattern.test(message));
}

/**
 * React.lazy for a route page. A failed import is rethrown as a ChunkLoadError (original
 * error in `cause`), so ErrorBoundary offers a page reload instead of a retry that cannot work.
 * @example
 * const BudgetPage = lazyPage(() => import('./pages/BudgetPage.jsx'));
 * @param {() => Promise<{default: import('react').ComponentType<any>}>} importer - Dynamic import.
 * @returns {import('react').LazyExoticComponent<import('react').ComponentType<any>>} Lazy component.
 */
export function lazyPage(importer) {
  return lazy(() =>
    Promise.resolve()
      .then(importer)
      .catch((cause) => {
        const detail = cause instanceof Error && cause.message ? `: ${cause.message}` : '';
        const error = new Error(`The page's code could not be downloaded${detail}`, { cause });
        error.name = CHUNK_LOAD_ERROR;
        throw error;
      }),
  );
}

/**
 * Reload the app so it fetches the current index.html and code files.
 * @returns {void}
 */
export function reloadPage() {
  window.location.reload();
}

/**
 * Vitest setup: jest-dom matchers, DOM cleanup and a matchMedia stub for jsdom.
 * Tests simulate phone widths with react-responsive's Context (see utils.jsx).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

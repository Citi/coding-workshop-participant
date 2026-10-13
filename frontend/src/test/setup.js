import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/**
 * jsdom has no matchMedia; evaluate simple min/max-width queries against a
 * 1280px-wide desktop viewport so responsive components render their desktop layout.
 */
const VIEWPORT_WIDTH = 1280;
window.matchMedia = window.matchMedia || ((query) => {
  const min = /min-width:\s*(\d+)/.exec(query);
  const max = /max-width:\s*(\d+)/.exec(query);
  const matches = (!min || VIEWPORT_WIDTH >= Number(min[1])) && (!max || VIEWPORT_WIDTH <= Number(max[1]));
  return {
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
});

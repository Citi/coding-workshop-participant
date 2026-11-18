import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no scrolling; the router calls scrollTo on navigation
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.location.hash = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

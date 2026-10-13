import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against a live app (frontend + API + database).
 * Start it first, e.g. `python3 ../backend/local_server.py` and `npm run dev`,
 * or point E2E_BASE_URL at a deployed CloudFront URL.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});

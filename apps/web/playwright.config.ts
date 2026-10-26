import { defineConfig } from '@playwright/test';

/**
 * Browser runs against the real web app on Vite. The API is never contacted: each spec
 * answers /api/v1 requests itself with contract-shaped synthetic data, and covers are
 * generated placeholders, so no run touches Discogs or a real collection.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './.impeccable/review/playwright',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    // The installed Chrome: no browser download needed.
    channel: 'chrome',
  },
  webServer: {
    command: 'pnpm exec vite --port 5174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
  },
});

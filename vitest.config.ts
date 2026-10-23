import { defineConfig } from 'vitest/config';

// Each workspace package owns its own vitest.config.ts; the root only fans out.
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    passWithNoTests: true,
  },
});

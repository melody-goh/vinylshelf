import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'contract',
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});

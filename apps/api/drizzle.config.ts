import { defineConfig } from 'drizzle-kit';

// `generate` only diffs schema.ts against previous migrations, so no database is needed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  strict: true,
});

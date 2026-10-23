/**
 * Vitest global setup for the API: rebuilds the test database from the committed
 * migrations once per run. Tests therefore exercise the same SQL that production
 * runs, not a schema pushed from TypeScript.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { resolveTestDatabaseUrl } from './database-url.js';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = resolveTestDatabaseUrl(process.env);
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach the test database. Is Postgres running (docker compose up -d)?\n${String(error)}`,
      { cause: error },
    );
  }
  try {
    await client.query(`
      drop schema if exists public cascade;
      drop schema if exists drizzle cascade;
      drop schema if exists pgboss cascade;
      create schema public;
    `);
  } finally {
    await client.end();
  }

  const handle = createDatabase(url, 1);
  try {
    await runMigrations(handle.db);
  } finally {
    await handle.close();
  }

  project.provide('testDatabaseUrl', url);
}

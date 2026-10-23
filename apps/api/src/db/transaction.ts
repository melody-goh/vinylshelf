import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { Database } from './client.js';
import * as schema from './schema.js';

/** Raw SQL access to the same connection, for libraries such as pg-boss. */
export interface SqlExecutor {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface Transaction {
  db: Database;
  sql: SqlExecutor;
}

/**
 * Runs `work` in one Postgres transaction on a dedicated connection. Drizzle and raw
 * SQL share that connection, so a job enqueued through `sql` commits or rolls back
 * together with the state change that caused it (ADR 0003). No job runs for a write
 * that never happened, and no write is left without its job.
 */
export async function runInTransaction<T>(
  pool: pg.Pool,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work({
      db: drizzle(client, { schema, casing: 'snake_case' }),
      sql: { executeSql: (text, values) => client.query(text, values) },
    });
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

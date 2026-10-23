import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
  /** Health probe: true when a trivial query succeeds. */
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
}

/**
 * Opens the shared connection pool. The pool is small on purpose: free Postgres tiers
 * cap connections, and the job queue opens its own (ADR 0003, ADR 0005).
 */
export function createDatabase(connectionString: string, maxConnections = 5): DatabaseHandle {
  const pool = new pg.Pool({ connectionString, max: maxConnections });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return {
    db,
    pool,
    ping: async () => {
      await db.execute(sql`select 1`);
      return true;
    },
    close: () => pool.end(),
  };
}

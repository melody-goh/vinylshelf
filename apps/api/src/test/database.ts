import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createDatabase, type Database, type DatabaseHandle } from '../db/client.js';

const TABLES = [
  'collection_items',
  'discogs_release_cache',
  'discogs_release_detail_cache',
  'itunes_preview_cache',
  'catalogue_masters',
  'catalogue_meta',
  'taste_feedback',
  'import_jobs',
  'sessions',
  'users',
] as const;

/**
 * Gives a test file a database handle and starts every test from empty tables. Test
 * files run one at a time (see vitest.config.ts), so truncating cannot disturb a
 * concurrent test.
 */
export function useTestDatabase(): { db: () => Database; handle: () => DatabaseHandle } {
  let handle: DatabaseHandle | undefined;

  beforeAll(() => {
    handle = createDatabase(inject('testDatabaseUrl'), 2);
  });

  beforeEach(async () => {
    await current().db.execute(
      sql.raw(`truncate table ${TABLES.map((t) => `"${t}"`).join(', ')} restart identity cascade`),
    );
  });

  afterAll(async () => {
    await handle?.close();
  });

  function current(): DatabaseHandle {
    if (!handle) throw new Error('useTestDatabase() handle used outside a test');
    return handle;
  }

  return { db: () => current().db, handle: current };
}

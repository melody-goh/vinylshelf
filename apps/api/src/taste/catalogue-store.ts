/**
 * Reads the taste catalogue for the engine: rows by id, and nearest neighbours by
 * pgvector's HNSW index (ADR 0008 §2). The engine itself does no I/O; this is the
 * `Retrieve` it is given in the app, where the offline evaluation gives it a scan.
 */
import { and, desc, inArray, notInArray, sql } from 'drizzle-orm';
import type { CatalogueRow } from '../catalogue/model.js';
import type { DatabaseHandle } from '../db/client.js';
import { catalogueMasters } from '../db/schema.js';
import { runInTransaction } from '../db/transaction.js';
import type { Retrieve } from './engine.js';
import type { MatchNames } from './search.js';
import { toPgVector } from './vectors.js';

/** pgvector's ceiling for hnsw.ef_search. */
const MAX_EF_SEARCH = 1000;

type StoredRow = typeof catalogueMasters.$inferSelect;

function toRow(stored: StoredRow): CatalogueRow {
  return { ...stored, embedding: Float32Array.from(stored.embedding) };
}

/** Catalogue rows for these master ids; ids not in the catalogue are skipped. */
export async function catalogueRows(
  database: DatabaseHandle,
  ids: readonly number[],
): Promise<CatalogueRow[]> {
  if (ids.length === 0) return [];
  const rows = await database.db
    .select()
    .from(catalogueMasters)
    .where(inArray(catalogueMasters.id, [...ids]));
  return rows.map(toRow);
}

/**
 * Nearest neighbours of the given kinds by cosine distance. HNSW returns no more than `ef_search` rows,
 * 40 by default, and filters after searching, so excluding owned records could leave
 * fewer than asked for. Raising `ef_search` to the limit and scanning iteratively in
 * strict order returns the full, correctly ordered list (pgvector 0.8). Both settings
 * are local to the transaction.
 */
export function pgvectorRetrieve(database: DatabaseHandle): Retrieve {
  return (vector, limit, exclude, kinds) =>
    runInTransaction(database.pool, async (tx) => {
      const efSearch = Math.min(MAX_EF_SEARCH, Math.max(40, limit));
      await tx.sql.executeSql(`set local hnsw.ef_search = ${String(efSearch)}`);
      await tx.sql.executeSql(`set local hnsw.iterative_scan = strict_order`);
      const rows = await tx.db
        .select()
        .from(catalogueMasters)
        .where(
          and(
            inArray(catalogueMasters.kind, [...kinds]),
            exclude.size > 0 ? notInArray(catalogueMasters.id, [...exclude]) : undefined,
          ),
        )
        // The distance alone: a second sort key would stop Postgres using the index.
        .orderBy(sql`${catalogueMasters.embedding} <=> ${toPgVector(vector)}::halfvec`)
        .limit(limit);
      return rows.map(toRow);
    });
}

/**
 * Records whose style or genre names contain any of the words (search's keyword half),
 * most pressed first. A scan of two short columns: fast enough at 150,000 rows for a
 * search box; a trigram index is the next step if it is ever not.
 */
export function pgMatchNames(database: DatabaseHandle): MatchNames {
  return async (words, limit, exclude, kinds) => {
    const patterns = words.map((w) => `%${w.replace(/[%_\\]/g, '')}%`);
    const names = sql`lower(${catalogueMasters.styles}::text || ' ' || ${catalogueMasters.genres}::text)`;
    const rows = await database.db
      .select()
      .from(catalogueMasters)
      .where(
        and(
          sql`${names} like any(array[${sql.join(
            patterns.map((p) => sql`${p}`),
            sql`, `,
          )}]::text[])`,
          inArray(catalogueMasters.kind, [...kinds]),
          exclude.size > 0 ? notInArray(catalogueMasters.id, [...exclude]) : undefined,
        ),
      )
      .orderBy(desc(catalogueMasters.versions))
      .limit(limit);
    return rows.map(toRow);
  };
}

/**
 * Loads a built catalogue into the database (ADR 0012 §4). Checks the file is the one
 * the manifest describes and that its vectors fit the column, then replaces the whole
 * catalogue inside one transaction: readers keep seeing the old catalogue until the new
 * one commits, and a failed load leaves the old one in place.
 */
import { join } from 'node:path';
import type { DatabaseHandle } from '../db/client.js';
import { CATALOGUE_DIMS, catalogueMasters, catalogueMeta } from '../db/schema.js';
import { runInTransaction } from '../db/transaction.js';
import { MANIFEST_FILE, readManifest, readRows, ROWS_FILE, sha256Of } from './artifact.js';
import type { CatalogueManifest, CatalogueRow } from './model.js';

/** Rows per INSERT: large enough to be quick, small enough for Postgres' parameter cap. */
const BATCH = 400;

export async function loadCatalogue(
  database: DatabaseHandle,
  dir: string,
  options: { log?: (message: string) => void; now?: () => Date } = {},
): Promise<CatalogueManifest> {
  const log = options.log ?? (() => undefined);
  const manifest = await readManifest(join(dir, MANIFEST_FILE));
  const rowsPath = join(dir, ROWS_FILE);

  const actual = await sha256Of(rowsPath);
  if (actual !== manifest.sha256) {
    throw new Error(`Catalogue file does not match its manifest (sha256 ${actual})`);
  }
  if (manifest.model.dims !== CATALOGUE_DIMS) {
    throw new Error(
      `Catalogue vectors have ${String(manifest.model.dims)} dimensions; the column holds ${String(CATALOGUE_DIMS)}`,
    );
  }

  await runInTransaction(database.pool, async (tx) => {
    await tx.db.delete(catalogueMasters);
    let batch: CatalogueRow[] = [];
    let loaded = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      await tx.db
        .insert(catalogueMasters)
        .values(batch.map((row) => ({ ...row, embedding: Array.from(row.embedding) })));
      loaded += batch.length;
      batch = [];
      if (loaded % 20_000 < BATCH) log(`loaded ${String(loaded)} of ${String(manifest.rows)}`);
    };
    for await (const row of readRows(rowsPath)) {
      batch.push(row);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    if (loaded !== manifest.rows) {
      throw new Error(
        `Manifest promises ${String(manifest.rows)} rows; the file has ${String(loaded)}`,
      );
    }
    const loadedAt = options.now?.() ?? new Date();
    await tx.db
      .insert(catalogueMeta)
      .values({ id: 1, manifest, loadedAt })
      .onConflictDoUpdate({ target: catalogueMeta.id, set: { manifest, loadedAt } });
  });
  log(`catalogue ${manifest.dump} loaded: ${String(manifest.rows)} masters`);
  return manifest;
}

/** The loaded catalogue's manifest, or null when none has been loaded. */
export async function loadedCatalogue(database: DatabaseHandle): Promise<CatalogueManifest | null> {
  const [row] = await database.db.select().from(catalogueMeta).limit(1);
  return row?.manifest ?? null;
}

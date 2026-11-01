/**
 * The whole loaded catalogue in memory, for the evaluation scripts that compare every
 * record (about 400 MB for 150,000 rows; scripts only, never the API). Read in pages, so
 * no single result holds every vector as text.
 */
import { asc, gt } from 'drizzle-orm';
import type { CatalogueRow } from '../../catalogue/model.js';
import type { DatabaseHandle } from '../../db/client.js';
import { catalogueMasters } from '../../db/schema.js';

export async function readCatalogue(
  database: DatabaseHandle,
  onProgress: (read: number) => void = () => undefined,
): Promise<CatalogueRow[]> {
  const rows: CatalogueRow[] = [];
  let after = 0;
  for (;;) {
    const page = await database.db
      .select()
      .from(catalogueMasters)
      .where(gt(catalogueMasters.id, after))
      .orderBy(asc(catalogueMasters.id))
      .limit(10_000);
    if (page.length === 0) return rows;
    for (const row of page) rows.push({ ...row, embedding: Float32Array.from(row.embedding) });
    after = page.at(-1)?.id ?? after;
    onProgress(rows.length);
  }
}

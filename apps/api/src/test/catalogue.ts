/**
 * Puts a small synthetic taste catalogue in the test database, as `catalogue:load`
 * would, so the taste routes run against real pgvector queries.
 */
import { createFakeEmbedder } from '../taste/embedder.js';
import { syntheticWorld, type SyntheticWorld } from '../taste/eval/synthetic.js';
import type { Database } from '../db/client.js';
import { CATALOGUE_DIMS, catalogueMasters, catalogueMeta } from '../db/schema.js';

export const TEST_DUMP = '20261001';

export async function testWorld(): Promise<SyntheticWorld> {
  return syntheticWorld(
    { seed: 3, scenes: 3, circlesPerScene: 2, perCircle: 14, noise: 30 },
    createFakeEmbedder(CATALOGUE_DIMS),
  );
}

export async function seedCatalogue(db: Database, world: SyntheticWorld): Promise<void> {
  await db
    .insert(catalogueMasters)
    .values(world.catalogue.map((row) => ({ ...row, embedding: Array.from(row.embedding) })));
  await db.insert(catalogueMeta).values({
    id: 1,
    loadedAt: new Date(0),
    manifest: {
      schemaVersion: 1,
      dump: TEST_DUMP,
      model: createFakeEmbedder(CATALOGUE_DIMS).model,
      rows: world.catalogue.length,
      sha256: '0'.repeat(64),
      builtAt: new Date(0).toISOString(),
      source: 'test',
    },
  });
}

/** Ids of one circle's records, in catalogue order. */
export function circle(world: SyntheticWorld, name: string): number[] {
  return world.catalogue.filter((r) => world.circleOf.get(r.id) === name).map((r) => r.id);
}

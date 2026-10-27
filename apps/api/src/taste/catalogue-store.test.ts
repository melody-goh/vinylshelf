import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../db/client.js';
import type { SyntheticWorld } from './eval/synthetic.js';
import { seedCatalogue, testWorld } from '../test/catalogue.js';
import { useTestDatabase } from '../test/database.js';
import { catalogueRows, pgvectorRetrieve } from './catalogue-store.js';
import { dot } from './vectors.js';

const { db, handle } = useTestDatabase();
let world: SyntheticWorld;
/**
 * A test catalogue is small enough that Postgres would rather scan the table than use
 * the HNSW index, which would hide the index's behaviour; this connection forbids it.
 */
let indexOnly: DatabaseHandle;

beforeAll(() => {
  const url = new URL(inject('testDatabaseUrl'));
  url.searchParams.set('options', '-c enable_seqscan=off');
  indexOnly = createDatabase(url.toString(), 1);
});

afterAll(async () => {
  await indexOnly.close();
});

beforeEach(async () => {
  world = await testWorld();
  await seedCatalogue(db(), world);
});

describe('pgvectorRetrieve', () => {
  it('returns the full limit, nearest first, even when the nearest are excluded', async () => {
    const query = world.catalogue[0]?.embedding ?? new Float32Array();
    const byCloseness = [...world.catalogue].sort(
      (a, b) => dot(b.embedding, query) - dot(a.embedding, query),
    );
    // More exclusions than HNSW's default candidate list of 40.
    const exclude = new Set(byCloseness.slice(0, 45).map((r) => r.id));

    const found = await pgvectorRetrieve(indexOnly)(
      query,
      50,
      exclude,
      new Set(['album'] as const),
    );

    expect(found).toHaveLength(50);
    expect(found.some((r) => exclude.has(r.id))).toBe(false);
    const similarities = found.map((r) => dot(r.embedding, query));
    similarities.slice(1).forEach((s, i) => {
      // Half precision rounds a little; the order must still hold.
      expect(s).toBeLessThanOrEqual((similarities[i] ?? 1) + 1e-3);
    });
  });
});

describe('catalogueRows', () => {
  it('reads rows by id with their vectors, skipping ids the catalogue lacks', async () => {
    const rows = await catalogueRows(handle(), [2, 1, 999_999]);
    expect(rows.map((r) => r.id).sort()).toEqual([1, 2]);
    const original = world.catalogue.find((r) => r.id === 1);
    expect(
      dot(rows.find((r) => r.id === 1)?.embedding ?? [], original?.embedding ?? []),
    ).toBeCloseTo(1, 2);
  });
});

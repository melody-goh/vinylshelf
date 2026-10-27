import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogueMasters } from '../db/schema.js';
import { createFakeEmbedder } from '../taste/embedder.js';
import { toPgVector } from '../taste/vectors.js';
import { useTestDatabase } from '../test/database.js';
import { readRows, ROWS_FILE } from './artifact.js';
import { CATALOGUE_SCHEMA_VERSION } from './model.js';
import { buildCatalogue } from './build.js';
import { describeMaster } from './describe.js';
import { loadCatalogue, loadedCatalogue } from './load.js';

const { db, handle } = useTestDatabase();

const fixture = (name: string) => () =>
  Promise.resolve(
    createReadStream(new URL(`../test/fixtures/discogs-dumps/${name}`, import.meta.url)),
  );

const embedder = createFakeEmbedder(384);
let out: string;

beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), 'catalogue-test-'));
});

afterEach(async () => {
  await rm(out, { recursive: true, force: true });
});

const build = (cap = 10) =>
  buildCatalogue(
    { releases: fixture('releases.xml'), masters: fixture('masters.xml') },
    {
      outDir: out,
      cap,
      embedder,
      dump: '20261001',
      source: 'fixtures',
      now: () => new Date('2026-10-26T12:00:00Z'),
    },
  );

async function rows() {
  const all = [];
  for await (const row of readRows(join(out, ROWS_FILE))) all.push(row);
  return all;
}

describe('buildCatalogue', () => {
  it('keeps vinyl masters, most pressed first, joined with their main release', async () => {
    const manifest = await build();

    expect(manifest).toMatchObject({
      schemaVersion: CATALOGUE_SCHEMA_VERSION,
      dump: '20261001',
      model: { id: 'fake/bag-of-words', dims: 384 },
      rows: 3,
      builtAt: '2026-10-26T12:00:00.000Z',
    });
    const built = await rows();
    // 200 is CD only; 999 is missing from the masters dump.
    expect(built.map((r) => [r.id, r.versions, r.vinylVersions])).toEqual([
      [100, 3, 2],
      [400, 2, 2],
      [300, 1, 1],
    ]);
    expect(built[0]).toMatchObject({
      title: 'Kind of Blue',
      mainReleaseId: 1,
      labels: ['Columbia'],
      country: 'US',
      styles: ['Modal', 'Hard Bop'],
    });
    expect(built[1]).toMatchObject({
      artists: ['Los Señores'],
      year: null,
      labels: ['Señal Records'],
    });
  });

  it('embeds each master from its description', async () => {
    await build();
    const [first] = await rows();
    if (!first) throw new Error('no rows');
    const [expected] = await embedder.embed([describeMaster(first)]);
    expect(Array.from(first.embedding).map((v) => Math.round(v * 100))).toEqual(
      Array.from(expected ?? []).map((v) => Math.round(v * 100)),
    );
  });

  it('stops at the cap', async () => {
    expect((await build(1)).rows).toBe(1);
  });
});

describe('loadCatalogue', () => {
  it('loads a built catalogue, records it, and answers nearest-neighbour queries', async () => {
    const manifest = await build();
    await loadCatalogue(handle(), out, { now: () => new Date('2026-10-26T13:00:00Z') });

    expect(await db().select({ id: catalogueMasters.id }).from(catalogueMasters)).toHaveLength(3);
    expect(await loadedCatalogue(handle())).toEqual(manifest);

    const [query] = await embedder.embed(['Electronic Ambient IDM Apollo']);
    const nearest = await db().execute<{ id: number }>(
      sql`select id from catalogue_masters order by embedding <=> ${toPgVector(query ?? [])}::halfvec limit 1`,
    );
    expect(nearest.rows[0]?.id).toBe(300);
  });

  it('replaces the whole catalogue on a second load', async () => {
    await build();
    await loadCatalogue(handle(), out);
    await build(1);
    await loadCatalogue(handle(), out);
    expect(await db().select({ id: catalogueMasters.id }).from(catalogueMasters)).toEqual([
      { id: 100 },
    ]);
  });

  it('refuses a file that does not match its manifest, and keeps the old catalogue', async () => {
    await build();
    await loadCatalogue(handle(), out);
    await writeFile(join(out, ROWS_FILE), 'tampered');
    await expect(loadCatalogue(handle(), out)).rejects.toThrow(/does not match its manifest/);
    expect(await db().select({ id: catalogueMasters.id }).from(catalogueMasters)).toHaveLength(3);
  });
});

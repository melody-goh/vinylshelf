import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { collectionItems, discogsReleaseCache, importJobs } from '../db/schema.js';
import type { ReleaseSummaryData } from '../discogs/gateway.js';
import type { Clock } from '../lib/clock.js';
import { buildTestApp, TEST_NOW, testConfig, type FakeQueue } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { createUser, sessionFor } from '../test/factories.js';

const { db, handle } = useTestDatabase();

const HOUR = 60 * 60 * 1000;
const TTL = testConfig.discogs.cacheTtlSeconds * 1000;

let app: FastifyInstance;
let deps: AppDependencies;
let userId: string;
let sid: string;

beforeEach(async () => {
  ({ app, deps } = await buildTestApp(handle()));
  userId = (await createUser(deps)).id;
  sid = await sessionFor(deps, userId);
});

afterEach(async () => {
  await app.close();
});

const clock = () => deps.clock as Clock & { time: number };
const queue = () => deps.queue as FakeQueue;

interface Seed {
  instanceId: number;
  title: string;
  artist: string;
  year: number | null;
  added: string;
  /** Discogs format names; vinyl when omitted. */
  formats?: string[] | null;
  genres?: string[];
  styles?: string[];
  colours?: string[];
  masterId?: number;
}

const SHELF: Seed[] = [
  {
    instanceId: 1,
    title: 'Kind of Blue',
    artist: 'Miles Davis',
    year: 1959,
    added: '2026-01-05T10:00:00Z',
  },
  {
    instanceId: 2,
    title: 'Blue Train',
    artist: 'john coltrane',
    year: 1958,
    added: '2026-03-01T10:00:00Z',
  },
  {
    instanceId: 3,
    title: 'Untitled Bootleg',
    artist: 'Anonymous',
    year: null,
    added: '2026-02-10T10:00:00Z',
  },
  {
    instanceId: 4,
    title: 'Promises',
    artist: 'Floating Points',
    year: 2021,
    added: '2026-03-01T10:00:00Z',
  },
  {
    instanceId: 5,
    title: 'Hejira',
    artist: 'Joni Mitchell',
    year: 1976,
    added: '2025-12-24T10:00:00Z',
  },
];

/** Puts releases in the cache "now" (per the test clock) and on the user's shelf. */
async function seed(items: Seed[] = SHELF, owner = userId): Promise<void> {
  const releases: ReleaseSummaryData[] = items.map((s) => ({
    discogsId: 100 + s.instanceId,
    masterId: s.masterId ?? null,
    title: s.title,
    artists: [s.artist],
    year: s.year,
    vinylColors: s.colours ?? [],
    formatNames: s.formats === undefined ? ['Vinyl'] : (s.formats ?? ['Vinyl']),
    genres: s.genres ?? [],
    styles: s.styles ?? [],
    coverImageUrl: null,
    discogsUrl: `https://www.discogs.com/release/${100 + s.instanceId}`,
  }));
  await deps.releaseCache.store(db(), releases);
  await db()
    .insert(collectionItems)
    .values(
      items.map((s) => ({
        userId: owner,
        instanceId: s.instanceId,
        releaseId: 100 + s.instanceId,
        dateAdded: new Date(s.added),
      })),
    );
}

interface PageBody {
  items: {
    instanceId: number;
    release: { title: string; discogsUrl: string; expiresAt: string };
  }[];
  nextCursor: string | null;
  totalItems: number;
  otherFormatsCount: number;
  matchedItems: number;
  refresh: { status: string; importId: string | null; hiddenCount: number; retryAt: string | null };
}

async function list(query = '', cookie = sid) {
  return app.inject({ url: `${API_PREFIX}/collection/items?${query}`, cookies: { sid: cookie } });
}

async function listBody(query = ''): Promise<PageBody> {
  const res = await list(query);
  expect(res.statusCode).toBe(200);
  return res.json<PageBody>();
}

/** Follows nextCursor to the end, returning instance ids in order. */
async function walk(sort: string, limit: number): Promise<number[]> {
  const ids: number[] = [];
  let cursor: string | null = null;
  do {
    const body: PageBody = await listBody(
      `sort=${sort}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    );
    ids.push(...body.items.map((i) => i.instanceId));
    cursor = body.nextCursor;
  } while (cursor);
  return ids;
}

describe('GET /collection/items: listing', () => {
  it('returns release summaries with the Discogs link for the credit, newest first', async () => {
    await seed();
    const body = await listBody();
    expect(body.items.map((i) => i.instanceId)).toEqual([4, 2, 3, 1, 5]);
    expect(body.items[0]?.release).toMatchObject({
      title: 'Promises',
      discogsUrl: 'https://www.discogs.com/release/104',
      expiresAt: new Date(TEST_NOW + TTL).toISOString(),
    });
    expect(body.nextCursor).toBeNull();
    expect(body.refresh).toEqual({ status: 'idle', importId: null, hiddenCount: 0, retryAt: null });
  });

  it.each([
    ['added_desc', [4, 2, 3, 1, 5]],
    ['added_asc', [5, 1, 3, 2, 4]],
    ['artist_asc', [3, 4, 2, 5, 1]], // case-insensitive
    ['year_asc', [2, 1, 5, 4, 3]], // unknown year last
    ['year_desc', [4, 5, 1, 2, 3]], // unknown year last
  ])('sorts by %s, and pages through it without gaps or repeats', async (sort, expected) => {
    await seed();
    expect((await listBody(`sort=${sort}`)).items.map((i) => i.instanceId)).toEqual(expected);
    expect(await walk(sort, 2)).toEqual(expected);
    expect(await walk(sort, 1)).toEqual(expected);
  });

  it('shows only the signed-in user’s shelf', async () => {
    const other = await createUser(deps, { id: 2000002, username: 'someone_else' });
    await seed(
      [
        {
          instanceId: 99,
          title: 'Theirs',
          artist: 'Someone',
          year: 2000,
          added: '2026-01-01T00:00:00Z',
        },
      ],
      other.id,
    );
    expect((await listBody()).items).toEqual([]);
  });

  it('rejects cursors that are malformed or from another sort, and limits over 100', async () => {
    await seed();
    const page = await listBody('sort=added_desc&limit=2');
    expect((await list(`sort=year_asc&cursor=${page.nextCursor}`)).statusCode).toBe(400);
    expect((await list('cursor=not-a-cursor')).json()).toMatchObject({ code: 'invalid_request' });
    expect((await list('limit=101')).statusCode).toBe(400);
  });

  it('requires a session', async () => {
    expect((await list('', 'nope')).statusCode).toBe(401);
  });
});

describe('GET /collection/items: vinyl only', () => {
  it('keeps CDs and cassettes off the shelf and counts them, but keeps an LP-and-CD set', async () => {
    await seed([
      { instanceId: 1, title: 'On Vinyl', artist: 'A', year: 2001, added: '2026-01-01T00:00:00Z' },
      {
        instanceId: 2,
        title: 'On CD',
        artist: 'B',
        year: 2002,
        added: '2026-01-02T00:00:00Z',
        formats: ['CD'],
      },
      {
        instanceId: 3,
        title: 'On Tape',
        artist: 'C',
        year: 2003,
        added: '2026-01-03T00:00:00Z',
        formats: ['Cassette'],
      },
      {
        instanceId: 4,
        title: 'Box Set',
        artist: 'D',
        year: 2004,
        added: '2026-01-04T00:00:00Z',
        formats: ['Box Set', 'Vinyl', 'CD'],
      },
    ]);

    const body = await listBody();
    expect(body.items.map((i) => i.release.title)).toEqual(['Box Set', 'On Vinyl']);
    expect(body.totalItems).toBe(2);
    expect(body.otherFormatsCount).toBe(2);
  });

  it('treats a release whose formats are not known yet as vinyl, so nothing vanishes', async () => {
    await seed([
      {
        instanceId: 1,
        title: 'Cached Before',
        artist: 'A',
        year: 2001,
        added: '2026-01-01T00:00:00Z',
      },
    ]);
    await db().update(discogsReleaseCache).set({ formatNames: null });

    const body = await listBody();
    expect(body.items.map((i) => i.release.title)).toEqual(['Cached Before']);
    expect(body.otherFormatsCount).toBe(0);
  });
});

describe('GET /collection/items and /collection/facets: the library', () => {
  const LIBRARY: Seed[] = [
    {
      instanceId: 1,
      title: 'Blue Train',
      artist: 'A',
      year: 1957,
      added: '2026-01-01T00:00:00Z',
      genres: ['Jazz'],
      styles: ['Hard Bop'],
      colours: [],
    },
    {
      instanceId: 2,
      title: 'Kind of Blue',
      artist: 'B',
      year: 1959,
      added: '2026-01-02T00:00:00Z',
      genres: ['Jazz'],
      styles: ['Modal'],
      colours: ['Blue Marbled'],
    },
    {
      instanceId: 3,
      title: 'Selected Ambient',
      artist: 'C',
      year: 1992,
      added: '2026-01-03T00:00:00Z',
      genres: ['Electronic'],
      styles: ['Ambient'],
      colours: [],
    },
    {
      instanceId: 4,
      title: 'Unknown Year',
      artist: 'D',
      year: null,
      added: '2026-01-04T00:00:00Z',
      genres: ['Jazz', 'Electronic'],
      styles: ['Fusion'],
      colours: ['Clear'],
    },
    {
      instanceId: 5,
      title: 'A CD',
      artist: 'E',
      year: 1958,
      added: '2026-01-05T00:00:00Z',
      genres: ['Jazz'],
      styles: ['Hard Bop'],
      formats: ['CD'],
    },
  ];

  it('filters by genre, style, decade and colourway, combined, and counts the matches', async () => {
    await seed(LIBRARY);
    const titles = async (query: string) => {
      const body = await listBody(query);
      return {
        titles: body.items.map((i) => i.release.title),
        matched: body.matchedItems,
        total: body.totalItems,
      };
    };

    expect(await titles('')).toEqual({
      titles: ['Unknown Year', 'Selected Ambient', 'Kind of Blue', 'Blue Train'],
      matched: 4,
      total: 4,
    });
    expect(await titles('genre=Jazz')).toMatchObject({
      titles: ['Unknown Year', 'Kind of Blue', 'Blue Train'],
      matched: 3,
      total: 4,
    });
    expect((await titles('style=Hard%20Bop')).titles).toEqual(['Blue Train']);
    expect((await titles('decade=1950')).titles).toEqual(['Kind of Blue', 'Blue Train']);
    expect((await titles('colourway=coloured')).titles).toEqual(['Unknown Year', 'Kind of Blue']);
    expect((await titles('genre=Jazz&decade=1950&colourway=black')).titles).toEqual(['Blue Train']);
    expect(await titles('genre=Polka')).toMatchObject({ titles: [], matched: 0, total: 4 });
  });

  it('rejects a decade that is not one', async () => {
    expect((await list('decade=1975')).statusCode).toBe(400);
    expect((await list('colourway=red')).statusCode).toBe(400);
  });

  it('lists what the shelf can be filtered by, with counts, vinyl only', async () => {
    await seed(LIBRARY);
    const res = await app.inject({ url: `${API_PREFIX}/collection/facets`, cookies: { sid } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      genres: [
        { name: 'Jazz', count: 3 },
        { name: 'Electronic', count: 2 },
      ],
      styles: [
        { name: 'Ambient', count: 1 },
        { name: 'Fusion', count: 1 },
        { name: 'Hard Bop', count: 1 },
        { name: 'Modal', count: 1 },
      ],
      decades: [
        { decade: 1950, count: 2 },
        { decade: 1990, count: 1 },
      ],
      colourways: { coloured: 2, black: 2 },
      expiresAt: new Date(TEST_NOW + testConfig.discogs.cacheTtlSeconds * 1000).toISOString(),
    });
  });

  it('describes an empty shelf as empty, and needs a session', async () => {
    const res = await app.inject({ url: `${API_PREFIX}/collection/facets`, cookies: { sid } });
    expect(res.json()).toEqual({
      genres: [],
      styles: [],
      decades: [],
      colourways: { coloured: 0, black: 0 },
      expiresAt: null,
    });
    expect((await app.inject({ url: `${API_PREFIX}/collection/facets` })).statusCode).toBe(401);
  });
});

describe('GET /collection/items: refresh state (ADR 0004 stale-while-revalidate)', () => {
  it('never returns expired data; an expired shelf reports refreshing, not empty', async () => {
    await seed();
    clock().time += TTL; // every cache row is now at its deadline

    const body = await listBody();

    expect(body.items).toEqual([]);
    expect(body.refresh).toMatchObject({ status: 'refreshing', hiddenCount: 5, retryAt: null });
    expect(body.refresh.importId).toEqual(expect.any(String));
    expect(queue().enqueued).toHaveLength(1);
  });

  it('backs off instead of re-importing while the last import failed recently', async () => {
    await seed();
    clock().time += TTL;
    const failedAt = new Date(clock().time - 5 * 60 * 1000);
    const [failed] = await db()
      .insert(importJobs)
      .values({
        userId,
        status: 'failed',
        createdAt: failedAt,
        updatedAt: failedAt,
        finishedAt: failedAt,
      })
      .returning();

    const body = await listBody();

    expect(body.items).toEqual([]);
    expect(body.refresh).toEqual({
      status: 'backoff',
      importId: failed?.id,
      hiddenCount: 5,
      retryAt: new Date(
        failedAt.getTime() + testConfig.refreshCooldownMinutes * 60 * 1000,
      ).toISOString(),
    });
    expect(queue().enqueued).toHaveLength(0);

    // Once the cooldown has passed, the next read tries again.
    clock().time = failedAt.getTime() + testConfig.refreshCooldownMinutes * 60 * 1000;
    expect((await listBody()).refresh.status).toBe('refreshing');
    expect(queue().enqueued).toHaveLength(1);
  });

  it('keeps serving data that is stale but not expired while refreshing in the background', async () => {
    await seed();
    clock().time += 5 * HOUR;
    const body = await listBody();
    expect(body.items).toHaveLength(5);
    expect(body.refresh).toMatchObject({ status: 'refreshing', hiddenCount: 0 });
    expect(queue().enqueued).toHaveLength(1);
  });

  it('reports a running import without starting another one', async () => {
    await seed();
    const [running] = await db()
      .insert(importJobs)
      .values({ userId, status: 'running' })
      .returning();
    clock().time += TTL;
    const body = await listBody();
    expect(body.refresh).toMatchObject({ status: 'refreshing', importId: running?.id });
    expect(queue().enqueued).toHaveLength(0);
  });

  it('counts only the expired part of a partly expired shelf as hidden', async () => {
    await seed(SHELF.slice(0, 2));
    clock().time += 2 * HOUR;
    await seed(SHELF.slice(2));
    clock().time = TEST_NOW + TTL; // the first two expire, the rest are 4h old
    const body = await listBody();
    expect(body.items.map((i) => i.instanceId).sort()).toEqual([3, 4, 5]);
    expect(body.totalItems).toBe(5); // hidden records still count
    expect(body.refresh).toMatchObject({ status: 'refreshing', hiddenCount: 2 });
  });

  it('is idle for a user who has never imported', async () => {
    expect((await listBody()).refresh).toEqual({
      status: 'idle',
      importId: null,
      hiddenCount: 0,
      retryAt: null,
    });
    expect(queue().enqueued).toHaveLength(0);
  });
});

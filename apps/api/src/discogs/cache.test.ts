import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { discogsReleaseCache, discogsReleaseDetailCache } from '../db/schema.js';
import { useTestDatabase } from '../test/database.js';
import { fakeClock } from '../test/fake-clock.js';
import { DiscogsReleaseCache, classifyRelease } from './cache.js';
import type { ReleaseDetailData, ReleaseSummaryData } from './gateway.js';

const { db } = useTestDatabase();

const SIX_HOURS = 6 * 60 * 60;
const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);

function release(id: number, overrides: Partial<ReleaseSummaryData> = {}): ReleaseSummaryData {
  return {
    discogsId: id,
    title: `Release ${id}`,
    artists: ['Ensemble Lumière'],
    year: 1974,
    vinylColors: [],
    formatNames: ['Vinyl'],
    masterId: null,
    genres: ['Classical'],
    styles: [],
    coverImageUrl: `https://i.discogs.com/fixture/cover-${id}.jpg`,
    discogsUrl: `https://www.discogs.com/release/${id}`,
    ...overrides,
  };
}

function setup(ttlSeconds = SIX_HOURS) {
  const clock = fakeClock(T0);
  return { clock, cache: new DiscogsReleaseCache(ttlSeconds, clock) };
}

describe('DiscogsReleaseCache', () => {
  it('stamps rows with fetched_at and a hard expiry one TTL later', async () => {
    const { cache } = setup();
    await cache.store(db(), [release(1)]);

    const fresh = await cache.getFresh(db(), [1]);
    expect(fresh.get(1)).toMatchObject({
      title: 'Release 1',
      artists: ['Ensemble Lumière'],
      fetchedAt: new Date(T0),
      expiresAt: new Date(T0 + SIX_HOURS * 1000),
    });
  });

  it('never returns a row at or past its expiry (ADR 0004 §3)', async () => {
    const { cache, clock } = setup(120);
    await cache.store(db(), [release(1), release(2)]);

    clock.time = T0 + 119_999;
    expect([...(await cache.getFresh(db(), [1, 2])).keys()]).toEqual([1, 2]);

    clock.time = T0 + 120_000;
    expect((await cache.getFresh(db(), [1, 2])).size).toBe(0);
  });

  it('restarts the TTL when a release is fetched again', async () => {
    const { cache, clock } = setup(120);
    await cache.store(db(), [release(1)]);
    clock.time = T0 + 100_000;
    await cache.store(db(), [release(1, { title: 'Release 1 (Remastered)' })]);

    clock.time = T0 + 200_000;
    expect((await cache.getFresh(db(), [1])).get(1)?.title).toBe('Release 1 (Remastered)');
  });

  it('accepts several copies of the same release in one batch', async () => {
    const { cache } = setup();
    await cache.store(db(), [release(1), release(1), release(2)]);
    expect(await db().select().from(discogsReleaseCache)).toHaveLength(2);
  });

  it('purges only expired rows and reports how many', async () => {
    const { cache, clock } = setup(120);
    await cache.store(db(), [release(1), release(2)]);
    clock.time = T0 + 60_000;
    await cache.store(db(), [release(3)]);

    clock.time = T0 + 150_000;
    expect(await cache.purgeExpired(db())).toBe(2);
    const remaining = await db().select().from(discogsReleaseCache);
    expect(remaining.map((r) => r.discogsId)).toEqual([3]);
  });

  it('refuses a TTL beyond 6 hours even if config validation were bypassed', () => {
    expect(() => new DiscogsReleaseCache(SIX_HOURS + 1, fakeClock())).toThrow(RangeError);
  });
});

describe('classifyRelease', () => {
  it('is restricted when it carries an image URL, cc0 otherwise', () => {
    expect(classifyRelease(release(1))).toBe('restricted');
    expect(classifyRelease(release(1, { coverImageUrl: null }))).toBe('cc0');
  });
});

describe('DiscogsReleaseCache: release detail', () => {
  const detail = (id: number): ReleaseDetailData => ({
    ...release(id),
    label: 'Fixture Classics',
    catalogNumber: 'FXC-74',
    genres: ['Classical'],
    styles: [],
    formats: ['2 × Vinyl, LP'],
    credits: [],
    tracklist: [{ position: 'A1', title: 'Prelude', duration: null }],
    community: { rating: { average: 4.5, count: 10 }, have: 40, want: 12 },
  });

  it('returns stored detail until its expiry, then nothing', async () => {
    const { cache, clock } = setup(120);
    await cache.storeDetail(db(), detail(7));

    expect((await cache.getFreshDetail(db(), 7))?.catalogNumber).toBe('FXC-74');
    clock.time = T0 + 120_000;
    expect(await cache.getFreshDetail(db(), 7)).toBeNull();
  });

  it('treats detail cached before a field existed as a miss, so it is refetched whole', async () => {
    const { cache } = setup(120);
    const stored = await cache.storeDetail(db(), detail(8));
    const older: Partial<ReleaseDetailData> = { ...stored };
    delete older.community;
    await db()
      .update(discogsReleaseDetailCache)
      .set({ detail: older as unknown as ReleaseDetailData })
      .where(eq(discogsReleaseDetailCache.discogsId, 8));

    expect(await cache.getFreshDetail(db(), 8)).toBeNull();
  });

  it('purges expired detail along with expired summaries', async () => {
    const { cache, clock } = setup(120);
    await cache.store(db(), [release(1)]);
    await cache.storeDetail(db(), detail(1));
    clock.time = T0 + 150_000;
    expect(await cache.purgeExpired(db())).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { fakeClock } from '../test/fake-clock.js';
import {
  DemoDiscogsGateway,
  demoToken,
  withDemo,
  type AppReads,
  type DemoLists,
} from './demo-gateway.js';
import { DiscogsNotFoundError, DiscogsUnavailableError } from './errors.js';
import type { DiscogsGateway, ReleaseDetailData, SearchPageData } from './gateway.js';

const TTL = 60;

function release(id: number): ReleaseDetailData {
  return {
    discogsId: id,
    title: `Record ${String(id)}`,
    artists: ['Someone'],
    year: 1970,
    vinylColors: [],
    formatNames: ['Vinyl'],
    masterId: null,
    genres: [],
    styles: [],
    coverImageUrl: null,
    discogsUrl: `https://www.discogs.com/release/${String(id)}`,
    label: null,
    catalogNumber: null,
    formats: [],
    credits: [],
    tracklist: [],
    community: { rating: { average: 0, count: 0 }, have: 0, want: 0 },
  };
}

function setup(options: { missing?: number[]; failOnce?: number[] } = {}) {
  const clock = fakeClock(0);
  const reads: number[] = [];
  const failing = new Set(options.failOnce);
  const app: AppReads = {
    getReleaseAsApp: (id) => {
      reads.push(id);
      if (options.missing?.includes(id)) return Promise.reject(new DiscogsNotFoundError('gone'));
      if (failing.delete(id)) return Promise.reject(new DiscogsUnavailableError('down'));
      return Promise.resolve(release(id));
    },
    searchReleasesAsApp: (): Promise<SearchPageData> =>
      Promise.resolve({
        page: 1,
        pages: 1,
        totalResults: 2,
        results: [1, 2].map((id) => ({
          discogsId: id,
          title: 'x',
          artists: [],
          year: null,
          country: null,
          label: null,
          catalogNumber: null,
          formats: [],
          thumbUrl: null,
          discogsUrl: '',
          inWantlist: false,
        })),
      }),
  };
  const collection = [
    { instanceId: 1, releaseId: 10, dateAdded: new Date(1000) },
    { instanceId: 2, releaseId: 20, dateAdded: new Date(3000) },
    { instanceId: 3, releaseId: 30, dateAdded: new Date(2000) },
  ];
  const wants = new Map<number, Date>([[2, new Date(5)]]);
  const lists: DemoLists = {
    collection: () => Promise.resolve(collection),
    addToCollection: () => Promise.resolve(4),
    wants: () =>
      Promise.resolve([...wants].map(([releaseId, dateAdded]) => ({ releaseId, dateAdded }))),
    want: (_user, id) => {
      if (!wants.has(id)) wants.set(id, new Date(clock.now()));
      return Promise.resolve(wants.get(id) ?? new Date(0));
    },
    unwant: (_user, id) => {
      wants.delete(id);
      return Promise.resolve();
    },
  };
  return { gateway: new DemoDiscogsGateway({ lists, app, clock, ttlSeconds: TTL }), clock, reads };
}

const visitor = demoToken('00000000-0000-4000-8000-000000000001');

describe('DemoDiscogsGateway', () => {
  it("serves the visitor's collection newest first, leaving out releases Discogs lost", async () => {
    const { gateway } = setup({ missing: [30] });
    const page = await gateway.getCollectionPage(visitor, 'demo', 1);
    expect(page.entries.map((e) => [e.instanceId, e.release.discogsId])).toEqual([
      [2, 20],
      [1, 10],
    ]);
    expect(page.totalItems).toBe(3);
  });

  it('reads each release once while it is fresh, again once it is not', async () => {
    const { gateway, clock, reads } = setup();
    await Promise.all([gateway.getRelease(visitor, 10), gateway.getRelease(visitor, 10)]);
    await gateway.getCollectionPage(visitor, 'demo', 1);
    expect(reads.filter((id) => id === 10)).toHaveLength(1);

    clock.time += TTL * 1000;
    await gateway.getRelease(visitor, 10);
    expect(reads.filter((id) => id === 10)).toHaveLength(2);
  });

  it('does not keep a failed read', async () => {
    const { gateway, reads } = setup({ failOnce: [10] });
    await expect(gateway.getRelease(visitor, 10)).rejects.toThrow(DiscogsUnavailableError);
    expect((await gateway.getRelease(visitor, 10)).discogsId).toBe(10);
    expect(reads).toEqual([10, 10]);
  });

  it('marks search results the visitor wants, and keeps their wants itself', async () => {
    const { gateway } = setup();
    const found = await gateway.searchReleases(visitor, 'blue', 1);
    expect(found.results.map((r) => [r.discogsId, r.inWantlist])).toEqual([
      [1, false],
      [2, true],
    ]);
    const want = await gateway.addToWantlist(visitor, 'demo', 10);
    expect(want.release.discogsId).toBe(10);
    await gateway.removeFromWantlist(visitor, 'demo', 2);
    const wants = await gateway.getWantlistPage(visitor, 'demo', 1);
    expect(wants.wants.map((w) => w.releaseId)).toEqual([10]);
  });

  it('never signs anyone in', async () => {
    const { gateway } = setup();
    await expect(gateway.getIdentity()).rejects.toThrow();
  });
});

describe('withDemo', () => {
  it('sends demo tokens to the demo gateway and every other call to Discogs', async () => {
    const called: string[] = [];
    const fake = (name: string) =>
      new Proxy({} as DiscogsGateway, {
        get: (_target, method) => () => {
          called.push(`${name}.${String(method)}`);
          return Promise.resolve();
        },
      });
    const gateway = withDemo(fake('real'), fake('demo'));
    await gateway.getRelease(visitor, 1);
    await gateway.getRelease({ token: 'abc', secret: 'def' }, 1);
    await gateway.getRequestToken('https://example.test/callback');
    expect(called).toEqual(['demo.getRelease', 'real.getRelease', 'real.getRequestToken']);
  });
});

import type { TasteRecommendations } from '@vinylshelf/contract';
import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { collectionItems, discogsReleaseCache } from '../db/schema.js';
import { buildTestApp, TEST_NOW, testConfig } from '../test/app.js';
import { circle, seedCatalogue, TEST_DUMP, testWorld } from '../test/catalogue.js';
import { useTestDatabase } from '../test/database.js';
import { discogsFixtures, discogsUrls } from '../test/discogs-handlers.js';
import { createUser, sessionFor } from '../test/factories.js';
import { mswServer } from '../test/msw.js';
import type { SyntheticWorld } from './eval/synthetic.js';
import { PICKS_PER_ROOM } from './service.js';

const { db, handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
let userId: string;
let world: SyntheticWorld;

/** The user's Discogs wantlist, as the wants of these masters. */
function wantlist(masterIds: readonly number[], status = 200) {
  mswServer.use(
    http.get(discogsUrls.wantlist, () => {
      if (status !== 200) return new HttpResponse(null, { status });
      const fixture = discogsFixtures.wantlistPage() as {
        wants: { basic_information: Record<string, unknown> }[];
      };
      const [template] = fixture.wants;
      return HttpResponse.json({
        pagination: { page: 1, pages: 1, per_page: 100, items: masterIds.length, urls: {} },
        wants: masterIds.map((masterId, i) => ({
          ...template,
          id: 8_000_000 + i,
          basic_information: {
            ...template?.basic_information,
            id: 8_000_000 + i,
            master_id: masterId,
          },
        })),
      });
    }),
  );
}

beforeEach(async () => {
  wantlist([]);
  ({ app, deps } = await buildTestApp(handle()));
  userId = (await createUser(deps)).id;
  sid = await sessionFor(deps, userId);
  world = await testWorld();
});

afterEach(async () => {
  await app.close();
});

const call = (
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options: { body?: unknown; origin?: string; cookie?: string | null } = {},
) =>
  app.inject({
    method,
    url: `${API_PREFIX}${path}`,
    headers: { origin: options.origin ?? testConfig.webOrigin },
    cookies: options.cookie === null ? {} : { sid: options.cookie ?? sid },
    ...(options.body === undefined ? {} : { payload: options.body as object }),
  });

const recommendations = async (distance = 'near') =>
  (await call('GET', `/taste/recommendations?distance=${distance}`)).json<TasteRecommendations>();

/** Puts these masters on the shelf, each as its own release. */
async function shelve(masterIds: readonly (number | null)[]) {
  await db()
    .insert(collectionItems)
    .values(
      masterIds.map((masterId, i) => ({
        userId,
        instanceId: i + 1,
        releaseId: 7_000_000 + i,
        masterId,
        dateAdded: new Date(TEST_NOW),
      })),
    );
}

/** A shelf following one circle of scene 0, with a quarter of the circle held back. */
const SHELF = () => circle(world, '0/0').slice(0, 10);
const titleOf = (id: number) => world.catalogue.find((r) => r.id === id)?.title;
const picks = (r: TasteRecommendations) => r.rooms.flatMap((room) => room.picks);

describe('GET /taste/recommendations', () => {
  it('says there is no catalogue when none is loaded', async () => {
    await shelve(SHELF());
    expect(await recommendations()).toEqual({
      status: 'no_catalogue',
      catalogue: null,
      basedOn: { shelfRecords: 10, inCatalogue: 0, wanted: null },
      rooms: [],
    });
  });

  it('waits for three shelf records the catalogue knows', async () => {
    await seedCatalogue(db(), world);
    await shelve([...SHELF().slice(0, 2), null, 999_999]);
    expect(await recommendations()).toEqual({
      status: 'too_few_records',
      catalogue: { dump: TEST_DUMP, rows: world.catalogue.length },
      basedOn: { shelfRecords: 4, inCatalogue: 2, wanted: 0 },
      rooms: [],
    });
  });

  it('recommends unowned records from the shelf, each with a reason drawn from it', async () => {
    await seedCatalogue(db(), world);
    await shelve(SHELF());

    const result = await recommendations();

    expect(result.status).toBe('ready');
    expect(result.basedOn).toEqual({ shelfRecords: 10, inCatalogue: 10, wanted: 0 });
    expect(result.rooms.length).toBeGreaterThan(0);
    const all = picks(result);
    const ids = all.map((p) => p.master.masterId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => SHELF().includes(id))).toBe(false);
    const shelfTitles = new Set(SHELF().map(titleOf));
    const shelfArtists = new Set(
      SHELF().flatMap((id) => world.catalogue.find((r) => r.id === id)?.artists ?? []),
    );
    for (const room of result.rooms) expect(room.picks.length).toBeLessThanOrEqual(PICKS_PER_ROOM);
    for (const pick of all) {
      expect(pick.master.discogsUrl).toBe(
        `https://www.discogs.com/master/${String(pick.master.masterId)}`,
      );
      // Every reason is checkable against the shelf: its fans-of artists and its link.
      expect(pick.reason.sound.length).toBeGreaterThan(0);
      expect(pick.reason.fansOf.length).toBeGreaterThan(0);
      for (const artist of pick.reason.fansOf) expect(shelfArtists.has(artist)).toBe(true);
      for (const title of pick.reason.link?.shelfTitles ?? []) {
        expect(shelfTitles.has(title)).toBe(true);
      }
    }
    // The circle's other records are what a good engine finds first.
    const rest = new Set(circle(world, '0/0').slice(10));
    expect(ids.slice(0, 4).filter((id) => rest.has(id)).length).toBeGreaterThanOrEqual(2);
  });

  it('gives the same answer for the same shelf', async () => {
    await seedCatalogue(db(), world);
    await shelve(SHELF());
    expect(await recommendations()).toEqual(await recommendations());
  });

  it('reaches only for artists the shelf does not have when far', async () => {
    await seedCatalogue(db(), world);
    await shelve(SHELF());
    // Own the top far pick's artist through a record the catalogue does not know,
    // whose artist is known only from the fresh release cache.
    const artist = picks(await recommendations('far'))[0]?.master.artists[0];
    if (!artist) throw new Error('expected a far pick');
    await db()
      .insert(collectionItems)
      .values({
        userId,
        instanceId: 100,
        releaseId: 7_000_010,
        masterId: null,
        dateAdded: new Date(TEST_NOW),
      });
    await db()
      .insert(discogsReleaseCache)
      .values({
        discogsId: 7_000_010,
        title: 'Uncatalogued',
        artists: [artist.toUpperCase()],
        artistSort: artist,
        year: null,
        vinylColors: [],
        coverImageUrl: null,
        discogsUrl: 'https://www.discogs.com/release/7000010',
        classification: 'restricted',
        fetchedAt: new Date(TEST_NOW),
        expiresAt: new Date(TEST_NOW + 60_000),
      });

    const far = picks(await recommendations('far'));

    expect(far.length).toBeGreaterThan(0);
    const owned = new Set(
      [
        ...SHELF().flatMap((id) => world.catalogue.find((r) => r.id === id)?.artists ?? []),
        artist,
      ].map((a) => a.toLowerCase()),
    );
    for (const pick of far) {
      expect(pick.master.artists.some((a) => owned.has(a.toLowerCase()))).toBe(false);
    }
  });

  it('learns from the wantlist, and never suggests a wanted record back', async () => {
    await seedCatalogue(db(), world);
    await shelve(SHELF());
    const before = picks(await recommendations()).map((p) => p.master.masterId);
    // Want two of the records it would have picked.
    const wantedIds = before.slice(0, 2);
    wantlist(wantedIds);

    const result = await recommendations();

    expect(result.basedOn.wanted).toBe(2);
    const after = picks(result).map((p) => p.master.masterId);
    expect(after.some((id) => wantedIds.includes(id))).toBe(false);
    // They join the shelf's rooms as if owned.
    expect(result.rooms.reduce((sum, room) => sum + room.size, 0)).toBe(SHELF().length + 2);
  });

  it('lets a small shelf with a wantlist get picks', async () => {
    await seedCatalogue(db(), world);
    await shelve(SHELF().slice(0, 1));
    wantlist(circle(world, '0/0').slice(10, 13));
    expect((await recommendations()).status).toBe('ready');
  });

  it('still recommends from the shelf when Discogs does not answer, and says so', async () => {
    await seedCatalogue(db(), world);
    await shelve(SHELF());
    wantlist([], 503);
    const result = await recommendations();
    expect(result.status).toBe('ready');
    expect(result.basedOn.wanted).toBeNull();
  });

  it('rejects an unknown distance and requires sign-in', async () => {
    expect((await call('GET', '/taste/recommendations?distance=sideways')).statusCode).toBe(400);
    expect((await call('GET', '/taste/recommendations', { cookie: null })).statusCode).toBe(401);
  });
});

describe('taste feedback', () => {
  beforeEach(async () => {
    await seedCatalogue(db(), world);
    await shelve(SHELF());
  });

  const feedback = (masterId: number, verdict: string) =>
    call('POST', '/taste/feedback', { body: { masterId, verdict } });

  it('"not for me" takes a pick out, and withdrawing it brings it back', async () => {
    const before = picks(await recommendations());
    const rejected = before[0]?.master.masterId ?? 0;

    expect((await feedback(rejected, 'less')).statusCode).toBe(204);
    expect(picks(await recommendations()).map((p) => p.master.masterId)).not.toContain(rejected);

    expect((await call('DELETE', `/taste/feedback/${String(rejected)}`)).statusCode).toBe(204);
    expect(picks(await recommendations())).toEqual(before);
  });

  it('"more like this" joins the shelf\'s rooms and is not picked again', async () => {
    const liked = picks(await recommendations())[0]?.master.masterId ?? 0;

    expect((await feedback(liked, 'more')).statusCode).toBe(204);
    const after = await recommendations();

    expect(picks(after).map((p) => p.master.masterId)).not.toContain(liked);
    expect(after.rooms.reduce((sum, room) => sum + room.size, 0)).toBe(SHELF().length + 1);
    expect(after.basedOn.inCatalogue).toBe(SHELF().length);
  });

  it('a new verdict replaces the old one', async () => {
    const id = picks(await recommendations())[0]?.master.masterId ?? 0;
    await feedback(id, 'more');
    await feedback(id, 'less');
    const after = await recommendations();
    expect(after.rooms.reduce((sum, room) => sum + room.size, 0)).toBe(SHELF().length);
  });

  it('refuses records outside the catalogue, bad verdicts, other origins and strangers', async () => {
    expect((await feedback(999_999, 'more')).json()).toMatchObject({
      status: 404,
      code: 'master_not_found',
    });
    expect((await feedback(1, 'sideways')).statusCode).toBe(400);
    expect(
      (
        await call('POST', '/taste/feedback', {
          body: { masterId: 1, verdict: 'more' },
          origin: 'https://evil.example',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', '/taste/feedback', {
          body: { masterId: 1, verdict: 'more' },
          cookie: null,
        })
      ).statusCode,
    ).toBe(401);
    expect((await call('DELETE', '/taste/feedback/1', { cookie: null })).statusCode).toBe(401);
  });

  it('treats withdrawing a verdict never given as done', async () => {
    expect((await call('DELETE', '/taste/feedback/12345')).statusCode).toBe(204);
    expect((await call('DELETE', '/taste/feedback/nope')).statusCode).toBe(204);
  });
});

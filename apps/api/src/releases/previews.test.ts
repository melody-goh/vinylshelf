import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { itunesPreviewCache } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';
import { buildTestApp, TEST_NOW } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers } from '../test/discogs-handlers.js';
import { createUser, sessionFor } from '../test/factories.js';
import { itunesHandlers, itunesUrls } from '../test/itunes-handlers.js';
import { mswServer } from '../test/msw.js';
import {
  ITUNES_ATTRIBUTION,
  PREVIEW_TTL_SECONDS,
  purgeExpiredPreviews,
} from './previews-service.js';

const { db, handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
/** Calls Apple received. */
let appleCalls: string[];

beforeEach(async () => {
  appleCalls = [];
  const count = (name: string) => () => {
    appleCalls.push(name);
    return undefined;
  };
  mswServer.use(
    http.get(itunesUrls.search, count('search')),
    http.get(itunesUrls.lookup, count('lookup')),
    ...itunesHandlers(),
    ...discogsHandlers(),
  );
  ({ app, deps } = await buildTestApp(handle()));
  sid = await sessionFor(deps, (await createUser(deps)).id);
});

afterEach(async () => {
  await app.close();
});

const previews = (id: number | string, cookie: string | null = sid) =>
  app.inject({
    url: `${API_PREFIX}/releases/${String(id)}/previews`,
    cookies: cookie === null ? {} : { sid: cookie },
  });

describe('GET /releases/{discogsId}/previews', () => {
  it('matches the tracklist to the store album, with the attribution Apple requires', async () => {
    const res = await previews(9000001);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      discogsId: 9000001,
      albumUrl: 'https://music.apple.com/gb/album/tidal-lines/1700000002?uo=4',
      attribution: ITUNES_ATTRIBUTION,
      tracks: [
        {
          position: 'A1',
          previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/fixture/1700000101.m4a',
          storeUrl: 'https://music.apple.com/gb/album/tidal-lines/1700000002?i=1700000101&uo=4',
        },
        {
          position: 'A2',
          previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/fixture/1700000102.m4a',
          storeUrl: 'https://music.apple.com/gb/album/tidal-lines/1700000002?i=1700000102&uo=4',
        },
        {
          position: 'B1',
          previewUrl: null,
          storeUrl: 'https://music.apple.com/gb/album/tidal-lines/1700000002?i=1700000103&uo=4',
        },
        {
          position: 'B2',
          previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/fixture/1700000104.m4a',
          storeUrl: 'https://music.apple.com/gb/album/tidal-lines/1700000002?i=1700000104&uo=4',
        },
      ],
      fetchedAt: new Date(TEST_NOW).toISOString(),
      expiresAt: new Date(TEST_NOW + PREVIEW_TTL_SECONDS * 1000).toISOString(),
    });
    expect(appleCalls).toEqual(['search', 'lookup']);
  });

  it('asks Apple once a day per record, then serves the cached match', async () => {
    await previews(9000001);
    await previews(9000001);
    expect(appleCalls).toEqual(['search', 'lookup']);

    (deps.clock as Clock & { time: number }).time += PREVIEW_TTL_SECONDS * 1000;
    await previews(9000001);
    expect(appleCalls).toEqual(['search', 'lookup', 'search', 'lookup']);
  });

  it('caches "no match" too, and answers it with every track silent', async () => {
    mswServer.use(
      http.get(itunesUrls.search, () => HttpResponse.json({ resultCount: 0, results: [] })),
    );

    const first = await previews(9000001);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ albumUrl: null });
    expect(
      first
        .json<{ tracks: { previewUrl: string | null }[] }>()
        .tracks.every((t) => t.previewUrl === null),
    ).toBe(true);

    await previews(9000001);
    expect(await db().select().from(itunesPreviewCache)).toHaveLength(1);
  });

  it('answers Apple’s limit with 429 and its outage with 503, caching neither', async () => {
    mswServer.use(http.get(itunesUrls.search, () => new HttpResponse(null, { status: 403 })));
    const limited = await previews(9000001);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();

    mswServer.use(http.get(itunesUrls.search, () => new HttpResponse(null, { status: 500 })));
    const down = await previews(9000001);
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ code: 'previews_unavailable' });

    expect(await db().select().from(itunesPreviewCache)).toHaveLength(0);
  });

  it('is 404 for a release Discogs does not have, and 401 without a session', async () => {
    expect((await previews(1)).statusCode).toBe(404);
    expect((await previews('abc')).statusCode).toBe(404);
    expect((await previews(9000001, null)).statusCode).toBe(401);
    expect(appleCalls).toEqual([]);
  });

  it('purges matches past their day', async () => {
    await previews(9000001);
    const later = new Date(TEST_NOW + PREVIEW_TTL_SECONDS * 1000);
    expect(await purgeExpiredPreviews(db(), later)).toBe(1);
  });
});

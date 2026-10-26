import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { discogsReleaseDetailCache } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';
import { buildTestApp, testConfig } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { createUser, sessionFor } from '../test/factories.js';
import { mswServer } from '../test/msw.js';

const { db, handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
/** Release ids Discogs was asked for. */
let fetched: string[];

beforeEach(async () => {
  fetched = [];
  mswServer.use(
    http.get(discogsUrls.release, ({ params }) => {
      fetched.push(String(params.id));
      return undefined;
    }),
    ...discogsHandlers(),
  );
  ({ app, deps } = await buildTestApp(handle()));
  sid = await sessionFor(deps, (await createUser(deps)).id);
});

afterEach(async () => {
  await app.close();
});

const clock = () => deps.clock as Clock & { time: number };
const getRelease = (id: string | number, cookie = sid) =>
  app.inject({ url: `${API_PREFIX}/releases/${String(id)}`, cookies: { sid: cookie } });

describe('GET /releases/{discogsId}', () => {
  it('returns the release with its TTL, and caches it so Discogs is asked once', async () => {
    const first = await getRelease(9000001);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      title: 'Tidal Lines',
      vinylColors: ['Blue Marbled'],
      catalogNumber: 'FX-001',
      tracklist: [{ position: 'A1', title: 'Shoreline' }, {}, {}, {}],
      credits: [{ role: 'Producer' }, { role: 'Mastered By' }],
      discogsUrl: 'https://www.discogs.com/release/9000001',
      expiresAt: new Date(clock().time + testConfig.discogs.cacheTtlSeconds * 1000).toISOString(),
    });

    expect((await getRelease(9000001)).statusCode).toBe(200);
    expect(fetched).toEqual(['9000001']);
    expect(await db().select().from(discogsReleaseDetailCache)).toHaveLength(1);
  });

  it('fetches again once the cached detail has expired (ADR 0004)', async () => {
    await getRelease(9000001);
    clock().time += testConfig.discogs.cacheTtlSeconds * 1000;

    expect((await getRelease(9000001)).statusCode).toBe(200);
    expect(fetched).toEqual(['9000001', '9000001']);
  });

  it('answers 404 for a release Discogs does not have, or an id that cannot exist', async () => {
    expect((await getRelease(1)).json()).toMatchObject({ status: 404, code: 'release_not_found' });
    expect((await getRelease('abc')).statusCode).toBe(404);
    expect((await getRelease(0)).statusCode).toBe(404);
    expect(fetched).toEqual(['1']);
  });

  it('maps Discogs failures to the documented answers', async () => {
    mswServer.use(http.get(discogsUrls.release, () => new HttpResponse(null, { status: 401 })));
    expect((await getRelease(9000001)).json()).toMatchObject({
      status: 401,
      code: 'discogs_auth_revoked',
    });

    mswServer.use(http.get(discogsUrls.release, () => new HttpResponse(null, { status: 502 })));
    expect((await getRelease(9000001)).json()).toMatchObject({
      status: 503,
      code: 'discogs_unavailable',
    });

    mswServer.use(
      http.get(discogsUrls.release, () =>
        HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '9' } }),
      ),
    );
    const limited = await getRelease(9000001);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('9');
  });

  it('requires a session', async () => {
    expect((await getRelease(9000001, 'nope')).statusCode).toBe(401);
    expect(fetched).toEqual([]);
  });
});

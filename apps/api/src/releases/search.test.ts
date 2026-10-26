import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { collectionItems } from '../db/schema.js';
import { buildTestApp, TEST_NOW, testConfig } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { createUser, sessionFor } from '../test/factories.js';
import { mswServer } from '../test/msw.js';
import { SEARCHES_PER_MINUTE } from './routes.js';

const { db, handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
let userId: string;

beforeEach(async () => {
  mswServer.use(...discogsHandlers());
  ({ app, deps } = await buildTestApp(handle()));
  userId = (await createUser(deps)).id;
  sid = await sessionFor(deps, userId);
});

afterEach(async () => {
  await app.close();
});

const search = (query: string, cookie: string | null = sid) =>
  app.inject({
    url: `${API_PREFIX}/search/releases?${query}`,
    cookies: cookie === null ? {} : { sid: cookie },
  });

describe('GET /search/releases', () => {
  it('passes results through with a display deadline, stored nowhere', async () => {
    const res = await search('q=tidal');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      page: 1,
      pages: 1,
      totalResults: 3,
      results: [
        {
          discogsId: 9000001,
          title: 'Tidal Lines',
          inCollection: false,
          fetchedAt: new Date(TEST_NOW).toISOString(),
          expiresAt: new Date(TEST_NOW + testConfig.discogs.cacheTtlSeconds * 1000).toISOString(),
        },
        { discogsId: 9000099, inCollection: false },
      ],
    });
  });

  it('marks a release already on the shelf, by the same check adding uses', async () => {
    await db()
      .insert(collectionItems)
      .values({ userId, instanceId: 1, releaseId: 9000001, dateAdded: new Date(TEST_NOW) });

    const results = (await search('q=tidal')).json<{ results: { inCollection: boolean }[] }>()
      .results;
    expect(results.map((r) => r.inCollection)).toEqual([true, false]);
  });

  it('refuses a query too short to be useful, before asking Discogs', async () => {
    let asked = false;
    mswServer.use(
      http.get(discogsUrls.search, () => {
        asked = true;
        return undefined;
      }),
    );
    expect((await search('q=%20a%20')).statusCode).toBe(400);
    expect(asked).toBe(false);
  });

  it('requires a session, and says so when Discogs access was revoked', async () => {
    expect((await search('q=tidal', null)).statusCode).toBe(401);

    mswServer.use(http.get(discogsUrls.search, () => HttpResponse.json({}, { status: 401 })));
    const revoked = await search('q=tidal');
    expect(revoked.statusCode).toBe(401);
    expect(revoked.json()).toMatchObject({ code: 'discogs_auth_revoked' });
  });

  it('answers 503 when Discogs is down', async () => {
    mswServer.use(http.get(discogsUrls.search, () => new HttpResponse(null, { status: 500 })));
    expect((await search('q=tidal')).statusCode).toBe(503);
  });

  it('limits searches per session, so one tab cannot drain the shared budget', async () => {
    for (let i = 0; i < SEARCHES_PER_MINUTE; i++) {
      expect((await search(`q=tidal${String(i)}`)).statusCode).toBe(200);
    }
    const limited = await search('q=tidal');
    expect(limited.statusCode).toBe(429);

    // Another user's session has its own allowance.
    const other = await sessionFor(
      deps,
      (await createUser(deps, { id: 1000002, username: 'second_collector' })).id,
    );
    expect((await search('q=tidal', other)).statusCode).toBe(200);
  });
});

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { collectionItems, discogsReleaseCache, discogsReleaseDetailCache } from '../db/schema.js';
import { buildTestApp, TEST_NOW, testConfig } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { createUser, sessionFor } from '../test/factories.js';
import { mswServer } from '../test/msw.js';

const { db, handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
let userId: string;
/** Writes Discogs received. */
let writes: string[];

beforeEach(async () => {
  writes = [];
  mswServer.use(
    http.post(discogsUrls.addToCollection, ({ params }) => {
      writes.push(String(params.id));
      return undefined;
    }),
    ...discogsHandlers(),
  );
  ({ app, deps } = await buildTestApp(handle()));
  userId = (await createUser(deps)).id;
  sid = await sessionFor(deps, userId);
});

afterEach(async () => {
  await app.close();
});

const add = (body: unknown, options: { origin?: string; cookie?: string | null } = {}) =>
  app.inject({
    method: 'POST',
    url: `${API_PREFIX}/collection/items`,
    headers: { origin: options.origin ?? testConfig.webOrigin },
    cookies: options.cookie === null ? {} : { sid: options.cookie ?? sid },
    payload: body as Record<string, unknown>,
  });

const shelf = () => db().select().from(collectionItems).where(eq(collectionItems.userId, userId));

describe('POST /collection/items', () => {
  it('writes to Discogs, then puts the new copy on the shelf with its release cached', async () => {
    const res = await add({ discogsId: 9000001 });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      instanceId: 2100000099,
      dateAdded: new Date(TEST_NOW).toISOString(),
      release: { discogsId: 9000001, title: 'Tidal Lines', vinylColors: ['Blue Marbled'] },
    });
    expect(writes).toEqual(['9000001']);
    expect(await shelf()).toMatchObject([{ instanceId: 2100000099, releaseId: 9000001 }]);
    expect(await db().select().from(discogsReleaseCache)).toHaveLength(1);
    expect(await db().select().from(discogsReleaseDetailCache)).toHaveLength(1);
  });

  it('refuses a release already on the shelf unless the user confirms another copy', async () => {
    await db()
      .insert(collectionItems)
      .values({ userId, instanceId: 1, releaseId: 9000001, dateAdded: new Date(TEST_NOW) });

    const refused = await add({ discogsId: 9000001 });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'already_in_collection' });
    expect(writes).toEqual([]);

    expect((await add({ discogsId: 9000001, allowDuplicate: true })).statusCode).toBe(201);
    expect(await shelf()).toHaveLength(2);
  });

  it('writes nothing for a release Discogs does not have', async () => {
    const res = await add({ discogsId: 1 });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'release_not_found' });
    expect(writes).toEqual([]);
    expect(await shelf()).toHaveLength(0);
  });

  it('changes nothing on the shelf when the Discogs write fails', async () => {
    mswServer.use(
      http.post(discogsUrls.addToCollection, () => new HttpResponse(null, { status: 500 })),
    );
    expect((await add({ discogsId: 9000001 })).statusCode).toBe(503);
    expect(await shelf()).toHaveLength(0);
  });

  it('says when Discogs access was revoked', async () => {
    mswServer.use(
      http.post(discogsUrls.addToCollection, () => HttpResponse.json({}, { status: 401 })),
    );
    const res = await add({ discogsId: 9000001 });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'discogs_auth_revoked' });
  });

  it('rejects other origins, missing sessions and malformed bodies', async () => {
    expect((await add({ discogsId: 9000001 }, { origin: 'https://evil.example' })).statusCode).toBe(
      403,
    );
    expect((await add({ discogsId: 9000001 }, { cookie: null })).statusCode).toBe(401);
    expect((await add({ discogsId: 'x' })).statusCode).toBe(400);
    expect((await add({ discogsId: 9000001, extra: true })).statusCode).toBe(400);
    expect(writes).toEqual([]);
  });
});

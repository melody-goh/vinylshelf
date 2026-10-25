import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { buildTestApp, TEST_NOW, testConfig } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { createUser, sessionFor } from '../test/factories.js';
import { mswServer } from '../test/msw.js';

const { handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
/** Writes Discogs received, as "METHOD id". */
let writes: string[];

beforeEach(async () => {
  writes = [];
  const record =
    (method: string) =>
    ({ params }: { params: Record<string, unknown> }) => {
      writes.push(`${method} ${String(params.id)}`);
      return undefined;
    };
  mswServer.use(
    http.put(discogsUrls.want, record('PUT')),
    http.delete(discogsUrls.want, record('DELETE')),
    ...discogsHandlers(),
  );
  ({ app, deps } = await buildTestApp(handle()));
  sid = await sessionFor(deps, (await createUser(deps)).id);
});

afterEach(async () => {
  await app.close();
});

const call = (
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
  options: { origin?: string; cookie?: string | null } = {},
) =>
  app.inject({
    method,
    url: `${API_PREFIX}${path}`,
    headers: { origin: options.origin ?? testConfig.webOrigin },
    cookies: options.cookie === null ? {} : { sid: options.cookie ?? sid },
  });

describe('GET /wantlist', () => {
  it('reads a page live from Discogs, every format, with display deadlines', async () => {
    const res = await call('GET', '/wantlist');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      page: 1,
      pages: 1,
      totalItems: 2,
      items: [
        {
          dateAdded: '2026-10-20T16:00:00.000Z',
          release: {
            discogsId: 9000101,
            title: 'Signal Fires',
            vinylColors: ['Purple'],
            fetchedAt: new Date(TEST_NOW).toISOString(),
            expiresAt: new Date(TEST_NOW + testConfig.discogs.cacheTtlSeconds * 1000).toISOString(),
          },
        },
        {
          release: { discogsId: 9000102, title: 'Low Tide Radio', year: null, coverImageUrl: null },
        },
      ],
    });
  });

  it('requires a session, and says when Discogs is down', async () => {
    expect((await call('GET', '/wantlist', { cookie: null })).statusCode).toBe(401);
    mswServer.use(http.get(discogsUrls.wantlist, () => new HttpResponse(null, { status: 500 })));
    expect((await call('GET', '/wantlist')).statusCode).toBe(503);
  });
});

describe('PUT and DELETE /wantlist/{discogsId}', () => {
  it('adds a release on Discogs and returns it', async () => {
    const res = await call('PUT', '/wantlist/9000101');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ release: { discogsId: 9000101, title: 'Signal Fires' } });
    expect(writes).toEqual(['PUT 9000101']);
  });

  it('is 404 for a release Discogs does not have', async () => {
    const res = await call('PUT', '/wantlist/1');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'release_not_found' });
  });

  it('removes on Discogs, and treats removing what is not wanted as done', async () => {
    expect((await call('DELETE', '/wantlist/9000101')).statusCode).toBe(204);
    expect((await call('DELETE', '/wantlist/1')).statusCode).toBe(204);
    expect(writes).toEqual(['DELETE 9000101', 'DELETE 1']);
  });

  it('rejects other origins and missing sessions before writing anything', async () => {
    expect(
      (await call('PUT', '/wantlist/9000101', { origin: 'https://evil.example' })).statusCode,
    ).toBe(403);
    expect((await call('DELETE', '/wantlist/9000101', { cookie: null })).statusCode).toBe(401);
    expect(writes).toEqual([]);
  });
});

/**
 * Contract tests (ADR 0001). Three guarantees:
 * 1. At compile time, our Zod response schemas equal the types generated from the spec.
 * 2. At run time, every implemented operation, in each documented outcome, returns a
 *    response that validates against openapi.yaml.
 * 3. Every route the app serves is documented in the spec.
 */
import type {
  CollectionPage,
  CollectionRefresh,
  ImportJob,
  Problem,
  ReleaseSummary,
  User,
} from '@vinylshelf/contract';
import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { API_PREFIX, buildApp, type AppDependencies } from '../app.js';
import { collectionItems, importJobs } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';
import { testConfig, testDependencies } from '../test/app.js';
import { expectToMatchContract, spec, type HttpMethod } from '../test/contract.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { createUser, sessionFor } from '../test/factories.js';
import { mswServer } from '../test/msw.js';
import { LOGIN_STARTS_PER_MINUTE } from '../auth/routes.js';
import type {
  collectionPageSchema,
  collectionRefreshSchema,
  importJobSchema,
  problemSchema,
  releaseSummarySchema,
  userSchema,
} from './schemas.js';

// 1. A mismatch makes `true` unassignable to `false`, which fails `pnpm typecheck`.
type Equivalent<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const typesMatch: [
  Equivalent<z.infer<typeof problemSchema>, Problem>,
  Equivalent<z.infer<typeof userSchema>, User>,
  Equivalent<z.infer<typeof importJobSchema>, ImportJob>,
  Equivalent<z.infer<typeof releaseSummarySchema>, ReleaseSummary>,
  Equivalent<z.infer<typeof collectionRefreshSchema>, CollectionRefresh>,
  Equivalent<z.infer<typeof collectionPageSchema>, CollectionPage>,
] = [true, true, true, true, true, true];

const { db, handle } = useTestDatabase();
const EVIL = 'https://evil.example';
const NO_SUCH_IMPORT = '00000000-0000-4000-8000-000000000000';

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
let userId: string;

beforeEach(async () => {
  mswServer.use(...discogsHandlers());
  deps = testDependencies(handle());
  app = await buildApp(deps);
  userId = (await createUser(deps)).id;
  sid = await sessionFor(deps, userId);
});

afterEach(async () => {
  await app.close();
});

interface CallOptions {
  /** Concrete path when the template has parameters. */
  path?: string;
  query?: string;
  signedIn?: boolean;
  origin?: string;
}

/** Calls an operation and asserts the response is one the spec documents. */
async function call(method: HttpMethod, template: string, options: CallOptions = {}) {
  const res = await app.inject({
    method: method === 'get' ? 'GET' : 'POST',
    url: `${API_PREFIX}${options.path ?? template}${options.query ? `?${options.query}` : ''}`,
    headers: { origin: options.origin ?? testConfig.webOrigin },
    cookies: options.signedIn === false ? {} : { sid },
  });
  expectToMatchContract(method, template, res);
  return res;
}

describe('contract: compile-time schema equivalence', () => {
  it('Zod response schemas match the generated contract types', () => {
    expect(typesMatch.every(Boolean)).toBe(true);
  });
});

describe('contract: responses validate against openapi.yaml', () => {
  it('GET /health', async () => {
    expect((await call('get', '/health', { signedIn: false })).statusCode).toBe(200);
  });

  it('GET /auth/discogs/start: 302, 503 and 429', async () => {
    expect((await call('get', '/auth/discogs/start', { signedIn: false })).statusCode).toBe(302);
    mswServer.use(
      http.get(discogsUrls.requestToken, () => new HttpResponse(null, { status: 500 })),
    );
    expect((await call('get', '/auth/discogs/start', { signedIn: false })).statusCode).toBe(503);
    for (let i = 2; i < LOGIN_STARTS_PER_MINUTE; i++) {
      await app.inject(`${API_PREFIX}/auth/discogs/start`);
    }
    expect((await call('get', '/auth/discogs/start', { signedIn: false })).statusCode).toBe(429);
  });

  it('GET /auth/discogs/callback: 302 and 400', async () => {
    const callback = '/auth/discogs/callback';
    expect((await call('get', callback, { signedIn: false, query: 'denied=x' })).statusCode).toBe(
      302,
    );
    expect((await call('get', callback, { signedIn: false })).statusCode).toBe(400);
  });

  it('GET /me: 200 and 401', async () => {
    expect((await call('get', '/me')).statusCode).toBe(200);
    expect((await call('get', '/me', { signedIn: false })).statusCode).toBe(401);
  });

  it('POST /auth/logout: 403, 204 and 401', async () => {
    expect((await call('post', '/auth/logout', { origin: EVIL })).statusCode).toBe(403);
    expect((await call('post', '/auth/logout')).statusCode).toBe(204);
    expect((await call('post', '/auth/logout')).statusCode).toBe(401);
  });

  it('POST /collection/imports: 202, 401 and 403', async () => {
    expect((await call('post', '/collection/imports')).statusCode).toBe(202);
    expect((await call('post', '/collection/imports', { signedIn: false })).statusCode).toBe(401);
    expect((await call('post', '/collection/imports', { origin: EVIL })).statusCode).toBe(403);
  });

  it('GET /collection/imports/latest and /{importId}: 200, 404 and 401', async () => {
    expect((await call('get', '/collection/imports/latest')).statusCode).toBe(404);
    const [job] = await db()
      .insert(importJobs)
      .values({
        userId,
        status: 'failed',
        fetched: 4,
        total: 10,
        error: {
          type: '/problems/discogs-unavailable',
          title: 'Discogs is unavailable',
          status: 503,
          code: 'discogs_unavailable',
        },
      })
      .returning();
    const jobPath = `/collection/imports/${job?.id ?? ''}`;
    const byId = '/collection/imports/{importId}';

    expect((await call('get', '/collection/imports/latest')).statusCode).toBe(200);
    expect((await call('get', byId, { path: jobPath })).statusCode).toBe(200);
    expect(
      (await call('get', byId, { path: `/collection/imports/${NO_SUCH_IMPORT}` })).statusCode,
    ).toBe(404);
    expect((await call('get', byId, { path: jobPath, signedIn: false })).statusCode).toBe(401);
  });

  it('GET /collection/items: 200 in each refresh state, 400 and 401', async () => {
    const items = '/collection/items';
    expect((await call('get', items)).json()).toMatchObject({ refresh: { status: 'idle' } });

    await deps.releaseCache.store(db(), [
      {
        discogsId: 1,
        title: 'Kind of Blue',
        artists: ['Miles Davis'],
        year: null,
        coverImageUrl: 'https://i.discogs.com/fixture/cover-1.jpg',
        discogsUrl: 'https://www.discogs.com/release/1',
      },
    ]);
    await db()
      .insert(collectionItems)
      .values({ userId, instanceId: 1, releaseId: 1, dateAdded: new Date(deps.clock.now()) });
    expect((await call('get', items)).json()).toMatchObject({ items: [{ instanceId: 1 }] });

    // Everything expired, and the last import failed a moment ago: backoff.
    (deps.clock as Clock & { time: number }).time += testConfig.discogs.cacheTtlSeconds * 1000;
    const now = new Date(deps.clock.now());
    await db()
      .insert(importJobs)
      .values({ userId, status: 'failed', createdAt: now, updatedAt: now, finishedAt: now });
    expect((await call('get', items)).json()).toMatchObject({ refresh: { status: 'backoff' } });

    expect((await call('get', items, { query: 'cursor=bad' })).statusCode).toBe(400);
    expect((await call('get', items, { signedIn: false })).statusCode).toBe(401);
  });
});

describe('contract: route inventory', () => {
  it('serves no route that openapi.yaml does not document', () => {
    const documented = new Set(
      Object.entries(spec.paths).flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
      ),
    );
    const served = app.apiRoutes
      .filter((r) => r.method !== 'HEAD' && r.url.startsWith(API_PREFIX))
      .map((r) => `${r.method} ${r.url.slice(API_PREFIX.length).replace(/:(\w+)/g, '{$1}')}`);

    expect(served.length).toBeGreaterThan(0);
    for (const route of served) {
      expect(documented, `${route} is served but not documented`).toContain(route);
    }
  });
});

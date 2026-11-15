import type { WantlistPage } from '@vinylshelf/contract';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { DISCOGS_API_BASE } from '../discogs/endpoints.js';
import { DEMO_STARTS_PER_HOUR } from '../auth/routes.js';
import { UserRepository } from '../auth/users.js';
import { runImport } from '../collection/import-worker.js';
import {
  collectionItems,
  demoCollection,
  demoWants,
  importJobs,
  sessions,
  users,
} from '../db/schema.js';
import { buildTestApp, type FakeQueue, testConfig } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsFixtures, discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { createUser } from '../test/factories.js';
import { mswServer } from '../test/msw.js';
import { silentLogger } from '../test/silent-logger.js';
import { SAMPLE_SHELF, SAMPLE_WANTS } from './sample.js';
import { DEMO_TTL_SECONDS } from './service.js';

const { db, handle } = useTestDatabase();
let app: FastifyInstance;
let deps: AppDependencies;
/** Every request that reached "Discogs", as "METHOD path auth-scheme". */
let discogs: string[];

beforeEach(async () => {
  discogs = [];
  // Ahead of the usual handlers, which refuse anything but a user's OAuth signature.
  mswServer.use(
    // Any release exists, and says who asked for it.
    http.get(discogsUrls.release, ({ request, params }) => {
      discogs.push(
        `GET /releases ${(request.headers.get('authorization') ?? '').split(' ')[0] ?? ''}`,
      );
      return HttpResponse.json({ ...discogsFixtures.release(9000001), id: Number(params.id) });
    }),
    http.all(`${DISCOGS_API_BASE}/users/*`, ({ request }) => {
      discogs.push(`${request.method} ${new URL(request.url).pathname}`);
      return HttpResponse.json({ message: 'not expected' }, { status: 500 });
    }),
    ...discogsHandlers(),
  );
  ({ app, deps } = await buildTestApp(handle()));
});

afterEach(async () => {
  await app.close();
});

const startDemo = (ip = '203.0.113.9') =>
  app.inject({
    method: 'POST',
    url: `${API_PREFIX}/auth/demo`,
    headers: { origin: testConfig.webOrigin },
    remoteAddress: ip,
  });

const sid = (res: LightMyRequestResponse) => res.cookies.find((c) => c.name === 'sid');

const as = (cookie: string, method: 'GET' | 'PUT' | 'DELETE', path: string) =>
  app.inject({
    method,
    url: `${API_PREFIX}${path}`,
    headers: { origin: testConfig.webOrigin },
    cookies: { sid: cookie },
  });

async function demoUser(): Promise<{ cookie: string; userId: string }> {
  const res = await startDemo();
  const cookie = sid(res)?.value ?? '';
  const me = (await as(cookie, 'GET', '/me')).json<{ id: string }>();
  return { cookie, userId: me.id };
}

describe('POST /auth/demo', () => {
  it('signs a visitor in to a demo of their own, with the sample lists, for a day', async () => {
    const res = await startDemo();
    expect(res.statusCode).toBe(204);
    expect(sid(res)).toMatchObject({ httpOnly: true, maxAge: DEMO_TTL_SECONDS });

    const me = await as(sid(res)?.value ?? '', 'GET', '/me');
    expect(me.json()).toMatchObject({ discogsUsername: 'demo', demo: true });
    expect(await db().select().from(demoCollection)).toHaveLength(SAMPLE_SHELF.length);
    expect(await db().select().from(demoWants)).toHaveLength(SAMPLE_WANTS.length);
    const [user] = await db().select().from(users);
    expect(user?.discogsUserId).toBeLessThan(0);
    // The shelf fills by the ordinary import.
    expect((deps.queue as FakeQueue).enqueued.map((j) => j.name)).toEqual(['collection-import']);

    // Each visitor gets their own.
    await startDemo();
    expect(await db().select().from(users)).toHaveLength(2);
  });

  it('is open to anyone, even on an invite-only server, unless demos are off', async () => {
    await app.close();
    ({ app, deps } = await buildTestApp(handle(), {
      config: { ...testConfig, allowedDiscogsUsers: ['someone'] },
    }));
    expect((await startDemo()).statusCode).toBe(204);

    await app.close();
    ({ app, deps } = await buildTestApp(handle(), {
      config: { ...testConfig, demoEnabled: false },
    }));
    expect((await startDemo()).json()).toMatchObject({ status: 404, code: 'demo_unavailable' });
  });

  it('limits how many demos one client can start an hour', async () => {
    for (let i = 0; i < DEMO_STARTS_PER_HOUR; i++) await startDemo();
    expect((await startDemo()).statusCode).toBe(429);
    expect((await startDemo('203.0.113.10')).statusCode).toBe(204);
  });
});

describe('a demo user', () => {
  it('gets the real import, read from Discogs with the app key and never their account', async () => {
    const { userId } = await demoUser();
    const [job] = await db().select().from(importJobs);
    await runImport(
      {
        id: 'pgboss-job',
        data: { importJobId: job?.id ?? '' },
        retryCount: 0,
        signal: new AbortController().signal,
      },
      {
        database: handle(),
        gateway: deps.gateway,
        users: new UserRepository(handle().db, deps.cipher),
        releaseCache: deps.releaseCache,
        clock: deps.clock,
        log: silentLogger,
      },
    );

    const shelf = await db().select().from(collectionItems);
    expect(shelf.filter((i) => i.userId === userId)).toHaveLength(SAMPLE_SHELF.length);
    expect(new Set(discogs)).toEqual(new Set(['GET /releases Discogs']));
    expect(discogs).toHaveLength(SAMPLE_SHELF.length);
  });

  it('keeps a wantlist here, and wanting never reaches Discogs', async () => {
    const { cookie } = await demoUser();
    const list = (await as(cookie, 'GET', '/wantlist')).json<WantlistPage>();
    expect(list.items.map((w) => w.release.discogsId).sort()).toEqual(
      SAMPLE_WANTS.map((w) => w.releaseId).sort(),
    );

    expect((await as(cookie, 'PUT', '/wantlist/9000001')).statusCode).toBe(200);
    expect(
      (await as(cookie, 'DELETE', `/wantlist/${String(SAMPLE_WANTS[0]?.releaseId)}`)).statusCode,
    ).toBe(204);
    const after = (await as(cookie, 'GET', '/wantlist')).json<WantlistPage>();
    expect(after.items.map((w) => w.release.discogsId)).toContain(9000001);
    expect(after.items).toHaveLength(SAMPLE_WANTS.length);
    expect(discogs.filter((d) => !d.startsWith('GET /releases'))).toEqual([]);
  });

  it('ends after a day, taking everything it did with it', async () => {
    const { userId } = await demoUser();
    const real = await createUser(deps);
    const repository = new UserRepository(handle().db, deps.cipher);

    expect(await repository.deleteEndedDemos(new Date(deps.clock.now()))).toBe(0);
    const later = new Date(deps.clock.now() + DEMO_TTL_SECONDS * 1000);
    expect(await repository.deleteEndedDemos(later)).toBe(1);

    expect((await db().select().from(users)).map((u) => u.id)).toEqual([real.id]);
    for (const table of [demoCollection, demoWants, sessions, importJobs]) {
      const rows = (await db().select().from(table)) as { userId: string }[];
      expect(rows.filter((r) => r.userId === userId)).toEqual([]);
    }
  });
});

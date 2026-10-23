import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppDependencies } from '../app.js';
import { UserRepository } from '../auth/users.js';
import { collectionItems, discogsReleaseCache, importJobs } from '../db/schema.js';
import { QUEUES } from '../jobs/queue.js';
import { testDependencies } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsFixtures, discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { createUser } from '../test/factories.js';
import { mswServer } from '../test/msw.js';
import { ImportService } from './imports.js';
import { runImport } from './import-worker.js';

const { db, handle } = useTestDatabase();

let deps: AppDependencies;
let userId: string;
let importJobId: string;
/** Collection pages Discogs was asked for, in order. */
let requestedPages: number[];

const silentLog = { warn: () => undefined, error: () => undefined } as never;

beforeEach(async () => {
  deps = testDependencies(handle());
  userId = (await createUser(deps)).id;
  importJobId = (await new ImportService(handle(), deps.queue, deps.clock).start(userId)).id;
  requestedPages = [];
  mswServer.use(
    http.get(discogsUrls.collection, ({ request }) => {
      requestedPages.push(Number(new URL(request.url).searchParams.get('page')));
      return undefined;
    }),
    ...discogsHandlers(),
  );
});

function run(retryCount = 0) {
  return runImport(
    { id: 'pgboss-job', data: { importJobId }, retryCount, signal: new AbortController().signal },
    {
      database: handle(),
      gateway: deps.gateway,
      users: new UserRepository(handle().db, deps.cipher),
      releaseCache: deps.releaseCache,
      clock: deps.clock,
      log: silentLog,
    },
  );
}

const job = async () =>
  (await db().select().from(importJobs).where(eq(importJobs.id, importJobId)))[0];

describe('runImport', () => {
  it('imports every page into shelf references and the TTL cache', async () => {
    await run();

    expect(await job()).toMatchObject({ status: 'succeeded', fetched: 3, total: 3, cursorPage: 3 });
    const items = await db().select().from(collectionItems);
    expect(items.map((i) => i.instanceId).sort()).toEqual([2100000001, 2100000002, 2100000003]);
    expect(await db().select().from(discogsReleaseCache)).toHaveLength(3);
    expect(requestedPages).toEqual([1, 2]);
  });

  it('resumes from its checkpoint after a failure, without refetching or double counting', async () => {
    let failPage2 = true;
    mswServer.use(
      http.get(discogsUrls.collection, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        requestedPages.push(page);
        if (page === 2 && failPage2) {
          failPage2 = false;
          return new HttpResponse(null, { status: 503 });
        }
        return undefined;
      }),
      ...discogsHandlers(),
    );

    await expect(run(0)).rejects.toThrow(); // retryable: left to pg-boss
    expect(await job()).toMatchObject({ status: 'running', cursorPage: 2, fetched: 2 });

    await run(1);
    expect(await job()).toMatchObject({ status: 'succeeded', cursorPage: 3, fetched: 3 });
    expect(requestedPages).toEqual([1, 2, 2]);
  });

  it('removes shelf items that are no longer in the Discogs collection', async () => {
    await db()
      .insert(collectionItems)
      .values({
        userId,
        instanceId: 1,
        releaseId: 1,
        dateAdded: new Date('2020-01-01T00:00:00Z'),
      });
    await run();
    const items = await db().select().from(collectionItems);
    expect(items.map((i) => i.instanceId)).not.toContain(1);
    expect(items).toHaveLength(3);
  });

  it('fails without retrying when Discogs access was revoked', async () => {
    mswServer.use(http.get(discogsUrls.collection, () => new HttpResponse(null, { status: 401 })));
    await run(0); // resolves: nothing for pg-boss to retry
    expect(await job()).toMatchObject({
      status: 'failed',
      error: { code: 'discogs_auth_revoked' },
    });
  });

  it('fails without retrying when Discogs changes its response shape', async () => {
    const drifted = discogsFixtures.collectionPage(1);
    delete (drifted.releases[0] as { instance_id?: unknown }).instance_id;
    mswServer.use(http.get(discogsUrls.collection, () => HttpResponse.json(drifted)));
    await run(0);
    expect(await job()).toMatchObject({
      status: 'failed',
      error: { code: 'discogs_unexpected_response' },
    });
  });

  it('fails once the retries are used up', async () => {
    mswServer.use(http.get(discogsUrls.collection, () => new HttpResponse(null, { status: 503 })));
    await run(QUEUES.collectionImport.retryLimit);
    expect(await job()).toMatchObject({ status: 'failed', error: { code: 'discogs_unavailable' } });
  });

  it('treats a redelivered, already finished job as a no-op', async () => {
    await run();
    requestedPages = [];
    await run();
    expect(requestedPages).toEqual([]);
    expect(await job()).toMatchObject({ status: 'succeeded', fetched: 3 });
  });
});

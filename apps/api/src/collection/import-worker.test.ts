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
import { silentLogger } from '../test/silent-logger.js';
import { ImportService } from './imports.js';
import { runImport } from './import-worker.js';

const { db, handle } = useTestDatabase();

let deps: AppDependencies;
let userId: string;
let importJobId: string;
/** Collection pages Discogs was asked for, in order. */
let requestedPages: number[];

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
      log: silentLogger,
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

  it("keeps each record's master id on the shelf reference, null when it has none", async () => {
    await run();
    const items = await db()
      .select({ releaseId: collectionItems.releaseId, masterId: collectionItems.masterId })
      .from(collectionItems);
    expect(items.sort((a, b) => a.releaseId - b.releaseId)).toEqual([
      { releaseId: 9000001, masterId: 800001 },
      { releaseId: 9000002, masterId: null },
      { releaseId: 9000003, masterId: 800003 },
    ]);
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

  it('keeps a copy added through the app after the import began (ADR 0009)', async () => {
    const started = (await job())?.createdAt ?? new Date(0);
    await db()
      .insert(collectionItems)
      .values({
        userId,
        instanceId: 2100000099,
        releaseId: 9000001,
        dateAdded: new Date(started.getTime() + 1000),
      });
    await run();
    const items = await db().select().from(collectionItems);
    expect(items.map((i) => i.instanceId)).toContain(2100000099);
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

describe('runImport: consistency (review findings)', () => {
  it('does not delete shelf items when the collection changed during the import', async () => {
    await run(); // shelf now holds all three records
    importJobId = (await new ImportService(handle(), deps.queue, deps.clock).start(userId)).id;

    // Second import: page 1 is served as before, then the newest record is removed on
    // Discogs. The oldest record moves up to page 1, which was already fetched, so no
    // page of this import contains it.
    mswServer.use(
      http.get(discogsUrls.collection, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        if (page === 1) return HttpResponse.json(discogsFixtures.collectionPage(1));
        return HttpResponse.json({ pagination: { page: 2, pages: 1, items: 2 }, releases: [] });
      }),
    );
    await run();

    const remaining = (await db().select().from(collectionItems)).map((i) => i.instanceId);
    expect(remaining).toContain(2100000003); // still in the collection; must not be deleted
    expect(await job()).toMatchObject({ status: 'succeeded' });
  });

  it('lets only one of two concurrent workers advance the checkpoint', async () => {
    // While this worker fetches page 2, a second worker on the same import commits it.
    mswServer.use(
      http.get(discogsUrls.collection, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        if (page === 2) {
          await db()
            .update(importJobs)
            .set({ cursorPage: 3, fetched: 3 })
            .where(eq(importJobs.id, importJobId));
        }
        return HttpResponse.json(discogsFixtures.collectionPage(page));
      }),
    );

    await run();

    // The superseded worker must neither add its page again nor touch the job's status.
    expect(await job()).toMatchObject({ status: 'running', cursorPage: 3, fetched: 3 });
  });
});

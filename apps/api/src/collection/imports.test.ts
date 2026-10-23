import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { importJobs } from '../db/schema.js';
import { buildTestApp, testConfig, type FakeQueue } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { createUser, sessionFor } from '../test/factories.js';
import type { Clock } from '../lib/clock.js';
import { IMPORT_STALLED_AFTER_MS, ImportService } from './imports.js';

const { db, handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
let userId: string;

beforeEach(async () => {
  ({ app, deps } = await buildTestApp(handle()));
  userId = (await createUser(deps)).id;
  sid = await sessionFor(deps, userId);
});

afterEach(async () => {
  await app.close();
});

const queue = () => deps.queue as FakeQueue;
const clock = () => deps.clock as Clock & { time: number };

const startImport = (cookie = sid, origin = testConfig.webOrigin) =>
  app.inject({
    method: 'POST',
    url: `${API_PREFIX}/collection/imports`,
    headers: { origin },
    cookies: { sid: cookie },
  });

describe('POST /collection/imports', () => {
  it('queues an import and enqueues its job in the same transaction', async () => {
    const res = await startImport();

    expect(res.statusCode).toBe(202);
    const body = res.json<{ id: string; status: string; progress: { fetched: number } }>();
    expect(body).toMatchObject({ status: 'queued', progress: { fetched: 0 } });
    expect(queue().enqueued).toHaveLength(1);
    const [entry] = queue().enqueued;
    expect(entry?.name).toBe('collection-import');
    expect(entry?.data).toEqual({ importJobId: body.id });
    // Enqueued through the transaction's connection, not the pool (ADR 0003).
    expect(typeof entry?.options.tx?.executeSql).toBe('function');
  });

  it('is idempotent while an import is active', async () => {
    const first = (await startImport()).json<{ id: string }>();
    const second = (await startImport()).json<{ id: string }>();
    expect(second.id).toBe(first.id);
    expect(queue().enqueued).toHaveLength(1);
  });

  it('creates exactly one job under concurrent requests', async () => {
    const service = new ImportService(handle(), deps.queue, deps.clock);
    const jobs = await Promise.all(Array.from({ length: 8 }, () => service.start(userId)));
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    expect(await db().select().from(importJobs)).toHaveLength(1);
  });

  it('starts a new import once the previous one finished', async () => {
    const first = (await startImport()).json<{ id: string }>();
    await db().update(importJobs).set({ status: 'succeeded' }).where(eq(importJobs.id, first.id));
    const second = (await startImport()).json<{ id: string }>();
    expect(second.id).not.toBe(first.id);
  });

  it('replaces an import that stopped making progress', async () => {
    const first = (await startImport()).json<{ id: string }>();
    clock().time += IMPORT_STALLED_AFTER_MS + 1;

    const second = (await startImport()).json<{ id: string }>();

    expect(second.id).not.toBe(first.id);
    const [stalled] = await db().select().from(importJobs).where(eq(importJobs.id, first.id));
    expect(stalled).toMatchObject({ status: 'failed', error: { code: 'import_stalled' } });
  });

  it('requires a session and a same-origin request', async () => {
    expect((await startImport('nope')).statusCode).toBe(401);
    expect((await startImport(sid, 'https://evil.example')).statusCode).toBe(403);
    expect(queue().enqueued).toHaveLength(0);
  });
});

describe('GET /collection/imports/{id} and /latest', () => {
  const get = (path: string, cookie = sid) =>
    app.inject({ url: `${API_PREFIX}/collection/imports/${path}`, cookies: { sid: cookie } });

  it('returns 404 for latest before any import, then the newest job', async () => {
    expect((await get('latest')).statusCode).toBe(404);
    const created = (await startImport()).json<{ id: string }>();
    expect((await get('latest')).json()).toMatchObject({ id: created.id, status: 'queued' });
  });

  it("returns the user's job by id, and 404 for anyone else's or a malformed id", async () => {
    const created = (await startImport()).json<{ id: string }>();
    expect((await get(created.id)).statusCode).toBe(200);

    const otherUser = await createUser(deps, { id: 2000002, username: 'someone_else' });
    const otherSid = await sessionFor(deps, otherUser.id);
    expect((await get(created.id, otherSid)).statusCode).toBe(404);
    expect((await get('not-a-uuid')).json()).toMatchObject({ code: 'import_not_found' });
  });

  it('requires a session', async () => {
    expect((await get('latest', 'nope')).statusCode).toBe(401);
  });
});

/**
 * Demo mode (ADR 0014): a visitor without a Discogs account gets a demo user of their
 * own, with the sample shelf and wantlist, signed in for as long as the demo lasts.
 * From then on they use the real app; the demo gateway stands in for Discogs.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { SessionStore } from '../auth/sessions.js';
import type { UserRepository } from '../auth/users.js';
import type { ImportService } from '../collection/imports.js';
import type { DatabaseHandle } from '../db/client.js';
import { demoCollection, demoWants } from '../db/schema.js';
import { QUEUES, type JobQueue } from '../jobs/queue.js';
import type { Clock } from '../lib/clock.js';
import { SAMPLE_SHELF, SAMPLE_WANTS } from './sample.js';

/** How long a demo lasts: its user, everything it did, and its session. */
export const DEMO_TTL_SECONDS = 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export class DemoService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
    private readonly imports: ImportService,
    private readonly clock: Clock,
  ) {}

  /**
   * Creates the visitor's demo user with the sample lists, starts the import that
   * fills their shelf, and returns their session. The sample records are dated a day
   * apart, newest first, so "recently added" has an order to show.
   */
  async start(): Promise<{ token: string; expiresAt: Date }> {
    const now = this.clock.now();
    const user = await this.users.createDemo(new Date(now + DEMO_TTL_SECONDS * 1000));
    const dated = (i: number) => new Date(now - (i + 1) * DAY_MS);
    await this.database.db.insert(demoCollection).values(
      SAMPLE_SHELF.map((record, i) => ({
        userId: user.id,
        instanceId: i + 1,
        releaseId: record.releaseId,
        dateAdded: dated(i),
      })),
    );
    await this.database.db.insert(demoWants).values(
      SAMPLE_WANTS.map((record, i) => ({
        userId: user.id,
        releaseId: record.releaseId,
        dateAdded: dated(i),
      })),
    );
    const session = await this.sessions.create(user.id, DEMO_TTL_SECONDS);
    await this.imports.start(user.id);
    return session;
  }
}

/** Deletes ended demos hourly; their rows go with them, as every user table cascades. */
export async function scheduleDemoCleanup(deps: {
  queue: JobQueue;
  users: UserRepository;
  clock: Clock;
  log: FastifyBaseLogger;
}): Promise<void> {
  await deps.queue.work(QUEUES.demoCleanup.name, async () => {
    const deleted = await deps.users.deleteEndedDemos(new Date(deps.clock.now()));
    if (deleted > 0) deps.log.info({ deleted }, 'Deleted ended demo users');
  });
  await deps.queue.schedule(QUEUES.demoCleanup.name, '0 * * * *');
}

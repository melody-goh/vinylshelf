import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '../db/client.js';
import type { DiscogsReleaseCache } from '../discogs/cache.js';
import { QUEUES, type JobQueue } from './queue.js';

export interface CachePurgeDependencies {
  queue: JobQueue;
  db: Database;
  cache: DiscogsReleaseCache;
  /** Cron expression (UTC). Production should run it hourly or less (ADR 0003 note). */
  cron: string;
  log: FastifyBaseLogger;
}

/**
 * Schedules the deletion of expired Discogs cache rows (ADR 0004 §3). Reads already
 * refuse expired rows; this job ensures they are not kept either.
 */
export async function scheduleCachePurge(deps: CachePurgeDependencies): Promise<void> {
  await deps.queue.work(QUEUES.discogsCachePurge.name, async () => {
    const deleted = await deps.cache.purgeExpired(deps.db);
    deps.log.info({ deleted }, 'Purged expired Discogs cache rows');
  });
  await deps.queue.schedule(QUEUES.discogsCachePurge.name, deps.cron);
}

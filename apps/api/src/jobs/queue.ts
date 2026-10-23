/**
 * The job queue behind a small interface (ADR 0003), so callers never import pg-boss
 * and the backend could move to Redis without touching them.
 */
import { PgBoss } from 'pg-boss';
import type { SqlExecutor } from '../db/transaction.js';

/**
 * Every queue and its delivery policy, in one place. Retries live here, at the job
 * level, because the Discogs gateway deliberately does not retry outages.
 */
export const QUEUES = {
  collectionImport: {
    name: 'collection-import',
    // Resumes from its checkpoint on each retry, so retries are cheap (ADR 0003).
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    // A whole import runs in one job; give a large collection room under the rate limit.
    expireInSeconds: 60 * 60,
  },
  discogsCachePurge: {
    name: 'discogs-cache-purge',
    retryLimit: 0,
    expireInSeconds: 5 * 60,
  },
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]['name'];

/**
 * The payload each queue carries. Typing it per queue means a producer and its worker
 * cannot disagree about the shape without a compile error.
 */
export interface JobPayloads {
  'collection-import': { importJobId: string };
  'discogs-cache-purge': Record<string, never>;
}

export interface QueuedJob<T> {
  id: string;
  data: T;
  /** 0 on the first attempt. */
  retryCount: number;
  /** Aborted when the queue is stopping or the job has expired. */
  signal: AbortSignal;
}

export interface EnqueueOptions {
  /** Enqueue inside the caller's transaction (see db/transaction.ts). */
  tx?: SqlExecutor;
  /** At most one queued or active job per key. */
  singletonKey?: string;
}

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueue<N extends QueueName>(
    name: N,
    data: JobPayloads[N],
    options?: EnqueueOptions,
  ): Promise<void>;
  work<N extends QueueName>(
    name: N,
    handler: (job: QueuedJob<JobPayloads[N]>) => Promise<void>,
  ): Promise<void>;
  /** Runs a queue on a cron schedule (UTC). Idempotent across restarts. */
  schedule(name: QueueName, cron: string): Promise<void>;
}

export interface PgBossQueueOptions {
  connectionString: string;
  /**
   * How often idle workers poll. Each poll is a query, which keeps a scale-to-zero
   * database awake, so production should use a long interval (ADR 0003 note).
   */
  pollingIntervalSeconds: number;
  onError: (error: Error) => void;
}

export class PgBossQueue implements JobQueue {
  private readonly boss: PgBoss;

  constructor(private readonly options: PgBossQueueOptions) {
    this.boss = new PgBoss({ connectionString: options.connectionString, max: 2 });
    // pg-boss emits background failures as events; an unhandled 'error' event would
    // crash the process.
    this.boss.on('error', options.onError);
  }

  async start(): Promise<void> {
    await this.boss.start();
    for (const { name, ...policy } of Object.values(QUEUES)) {
      if (!(await this.boss.getQueue(name))) await this.boss.createQueue(name, policy);
    }
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 10_000 });
  }

  async enqueue<N extends QueueName>(
    name: N,
    data: JobPayloads[N],
    options: EnqueueOptions = {},
  ): Promise<void> {
    await this.boss.send(name, data, {
      ...(options.tx ? { db: options.tx } : {}),
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
    });
  }

  async work<N extends QueueName>(
    name: N,
    handler: (job: QueuedJob<JobPayloads[N]>) => Promise<void>,
  ): Promise<void> {
    await this.boss.work<JobPayloads[N]>(
      name,
      { pollingIntervalSeconds: this.options.pollingIntervalSeconds, batchSize: 1 },
      async (jobs) => {
        for (const job of jobs) {
          await handler({
            id: job.id,
            data: job.data,
            retryCount: job.retryCount,
            signal: job.signal,
          });
        }
      },
    );
  }

  async schedule(name: QueueName, cron: string): Promise<void> {
    await this.boss.schedule(name, cron);
  }
}

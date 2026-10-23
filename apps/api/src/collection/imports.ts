/**
 * Collection import jobs: creation (idempotent per user), lookup and their wire shape.
 * The work itself is done by import-worker.ts.
 */
import type { ImportJob } from '@vinylshelf/contract';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client.js';
import { importJobs } from '../db/schema.js';
import { runInTransaction } from '../db/transaction.js';
import { ProblemError } from '../http/problem.js';
import { QUEUES, type JobQueue } from '../jobs/queue.js';
import type { Clock } from '../lib/clock.js';

export type ImportJobRow = typeof importJobs.$inferSelect;

const ACTIVE = ['queued', 'running'] as const;

/**
 * An active job whose checkpoint has not moved for longer than the queue would let it
 * run is considered lost (crashed worker, deleted queue row). Without this, the
 * one-active-import-per-user index would block that user's imports forever.
 */
export const IMPORT_STALLED_AFTER_MS = (QUEUES.collectionImport.expireInSeconds + 10 * 60) * 1000;

export class ImportService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly queue: JobQueue,
    private readonly clock: Clock,
  ) {}

  /**
   * Starts an import, or returns the one already queued or running (idempotent).
   * The job row and its queue message are written in one transaction (ADR 0003).
   * Concurrent calls are serialised by the partial unique index, not by app logic.
   */
  async start(userId: string): Promise<ImportJobRow> {
    await this.failIfStalled(userId);
    const now = new Date(this.clock.now());

    return runInTransaction(this.database.pool, async (tx) => {
      const [created] = await tx.db
        .insert(importJobs)
        .values({ userId, createdAt: now, updatedAt: now })
        .onConflictDoNothing({
          target: importJobs.userId,
          where: sql`status in ('queued', 'running')`,
        })
        .returning();
      if (created) {
        await this.queue.enqueue(
          QUEUES.collectionImport.name,
          { importJobId: created.id },
          { tx: tx.sql },
        );
        return created;
      }
      const [active] = await tx.db
        .select()
        .from(importJobs)
        .where(and(eq(importJobs.userId, userId), inArray(importJobs.status, ACTIVE)))
        .limit(1);
      if (!active) throw new Error('Import conflict without an active job');
      return active;
    });
  }

  /** A job owned by the user. Other users' jobs are indistinguishable from missing ones. */
  async get(userId: string, importId: string): Promise<ImportJobRow> {
    const [row] = await this.database.db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, importId), eq(importJobs.userId, userId)))
      .limit(1);
    if (!row) throw new ProblemError(404, 'import_not_found', 'Import not found');
    return row;
  }

  /** The user's most recent job, or null if they have never imported. */
  async latest(userId: string): Promise<ImportJobRow | null> {
    const [row] = await this.database.db
      .select()
      .from(importJobs)
      .where(eq(importJobs.userId, userId))
      .orderBy(desc(importJobs.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async failIfStalled(userId: string): Promise<void> {
    const now = this.clock.now();
    await this.database.db
      .update(importJobs)
      .set({
        status: 'failed',
        error: {
          type: '/problems/import-stalled',
          title: 'Import stopped making progress',
          status: 500,
          code: 'import_stalled',
        },
        updatedAt: new Date(now),
        finishedAt: new Date(now),
      })
      .where(
        and(
          eq(importJobs.userId, userId),
          inArray(importJobs.status, ACTIVE),
          lt(importJobs.updatedAt, new Date(now - IMPORT_STALLED_AFTER_MS)),
        ),
      );
  }
}

/** The contract's ImportJob shape. */
export function toImportJobDto(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    status: row.status,
    progress: {
      fetched: row.fetched,
      ...(row.total === null ? {} : { total: row.total }),
    },
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

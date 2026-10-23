/**
 * Runs one collection import: pages through the user's Discogs collection under the
 * gateway's rate limit, checkpointing after every page (ADR 0003).
 *
 * Each page is one transaction that writes the cache rows, the shelf references and
 * the advanced checkpoint together. A crash, host sleep or retry therefore resumes at
 * the first page that was not committed, without refetching or double-counting.
 */
import type { Problem } from '@vinylshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { UserRepository } from '../auth/users.js';
import { TokenDecryptionError } from '../crypto/token-cipher.js';
import type { DatabaseHandle } from '../db/client.js';
import { collectionItems, importJobs } from '../db/schema.js';
import { runInTransaction } from '../db/transaction.js';
import type { DiscogsReleaseCache } from '../discogs/cache.js';
import { DiscogsAuthError, DiscogsError, DiscogsSchemaError } from '../discogs/errors.js';
import type { DiscogsGateway } from '../discogs/gateway.js';
import { QUEUES, type QueuedJob } from '../jobs/queue.js';
import type { Clock } from '../lib/clock.js';

export interface ImportWorkerDependencies {
  database: DatabaseHandle;
  gateway: DiscogsGateway;
  users: UserRepository;
  releaseCache: DiscogsReleaseCache;
  clock: Clock;
  log: FastifyBaseLogger;
}

export class ImportAbortedError extends Error {
  override name = 'ImportAbortedError';
}

export async function runImport(
  job: QueuedJob<{ importJobId: string }>,
  deps: ImportWorkerDependencies,
): Promise<void> {
  const { database, gateway, releaseCache, clock } = deps;
  const importJobId = job.data.importJobId;
  const now = () => new Date(clock.now());

  // Claim the job. A redelivered job that already finished (or was failed as stalled)
  // is a no-op, so delivery can safely be at-least-once.
  const [row] = await database.db
    .update(importJobs)
    .set({ status: 'running', updatedAt: now() })
    .where(and(eq(importJobs.id, importJobId), inArray(importJobs.status, ['queued', 'running'])))
    .returning();
  if (!row) return;

  try {
    const owner = await deps.users.accessToken(row.userId);
    if (!owner) return; // User deleted; the job row goes with them (ON DELETE CASCADE).

    let page = row.cursorPage;
    for (;;) {
      if (job.signal.aborted) throw new ImportAbortedError('Import interrupted; will resume');

      const result = await gateway.getCollectionPage(owner.token, owner.user.discogsUsername, page);

      await runInTransaction(database.pool, async (tx) => {
        await releaseCache.store(
          tx.db,
          result.entries.map((e) => e.release),
        );
        if (result.entries.length > 0) {
          await tx.db
            .insert(collectionItems)
            .values(
              result.entries.map((e) => ({
                userId: row.userId,
                instanceId: e.instanceId,
                releaseId: e.releaseId,
                dateAdded: e.dateAdded,
                lastSeenImportId: importJobId,
              })),
            )
            .onConflictDoUpdate({
              target: [collectionItems.userId, collectionItems.instanceId],
              set: {
                releaseId: sql`excluded.release_id`,
                dateAdded: sql`excluded.date_added`,
                lastSeenImportId: sql`excluded.last_seen_import_id`,
              },
            });
        }
        await tx.db
          .update(importJobs)
          .set({
            cursorPage: page + 1,
            fetched: sql`${importJobs.fetched} + ${result.entries.length}`,
            total: result.totalItems,
            updatedAt: now(),
          })
          .where(eq(importJobs.id, importJobId));
      });

      if (page >= result.pages) break;
      page++;
    }

    await runInTransaction(database.pool, async (tx) => {
      // Items no page of this import contained were removed on Discogs (ADR 0006 §6).
      // An item added during the import can shift between pages and be missed; it
      // reappears on the next import.
      await tx.db
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.userId, row.userId),
            or(
              isNull(collectionItems.lastSeenImportId),
              ne(collectionItems.lastSeenImportId, importJobId),
            ),
          ),
        );
      await tx.db
        .update(importJobs)
        .set({ status: 'succeeded', updatedAt: now(), finishedAt: now() })
        .where(eq(importJobs.id, importJobId));
    });
  } catch (error) {
    const retriesLeft = job.retryCount < QUEUES.collectionImport.retryLimit;
    if (isRetryable(error) && retriesLeft) {
      deps.log.warn({ err: error, importJobId, retryCount: job.retryCount }, 'Import will retry');
      throw error; // pg-boss retries with backoff; the checkpoint makes that cheap.
    }
    deps.log.error({ err: error, importJobId }, 'Import failed');
    await database.db
      .update(importJobs)
      .set({ status: 'failed', error: toProblem(error), updatedAt: now(), finishedAt: now() })
      .where(eq(importJobs.id, importJobId));
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DiscogsError) return error.retryable;
  if (error instanceof TokenDecryptionError) return false;
  // Aborts, database hiccups and other unexpected errors: worth another attempt.
  return true;
}

/** What the user is told about a failed import. Internal details stay in the log. */
function toProblem(error: unknown): Problem {
  if (error instanceof DiscogsAuthError || error instanceof TokenDecryptionError) {
    return {
      type: '/problems/discogs-auth-revoked',
      title: 'Discogs access was revoked. Sign in again to import.',
      status: 401,
      code: 'discogs_auth_revoked',
    };
  }
  if (error instanceof DiscogsSchemaError) {
    return {
      type: '/problems/discogs-unexpected-response',
      title: 'Discogs returned data we could not read',
      status: 502,
      code: 'discogs_unexpected_response',
    };
  }
  if (error instanceof DiscogsError) {
    return {
      type: '/problems/discogs-unavailable',
      title: 'Discogs is unavailable. Try again later.',
      status: 503,
      code: 'discogs_unavailable',
    };
  }
  return {
    type: '/problems/import-failed',
    title: 'Import failed',
    status: 500,
    code: 'import_failed',
  };
}

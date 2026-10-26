/**
 * Adding a record: written to the user's Discogs collection first, then put on the
 * shelf (ADR 0009). Discogs is the source of truth, so a failed write changes nothing
 * here, and a failure after the write is healed by the next import.
 */
import type { CollectionItem } from '@vinylshelf/contract';
import { and, eq } from 'drizzle-orm';
import type { UserRepository } from '../auth/users.js';
import type { DatabaseHandle } from '../db/client.js';
import { collectionItems } from '../db/schema.js';
import { runInTransaction } from '../db/transaction.js';
import type { DiscogsReleaseCache } from '../discogs/cache.js';
import type { DiscogsGateway } from '../discogs/gateway.js';
import { toProblem } from '../discogs/problems.js';
import { ProblemError } from '../http/problem.js';
import type { Clock } from '../lib/clock.js';

export interface AddRequest {
  userId: string;
  discogsId: number;
  /** The user confirmed they own another copy (ADR 0009 §3). */
  allowDuplicate: boolean;
}

export class CollectionAddService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly cache: DiscogsReleaseCache,
    private readonly gateway: DiscogsGateway,
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async add({ userId, discogsId, allowDuplicate }: AddRequest): Promise<CollectionItem> {
    const { db } = this.database;
    const owner = await this.users.accessToken(userId);
    if (!owner) throw new ProblemError(401, 'unauthenticated', 'Sign in required');

    if (!allowDuplicate) {
      const [existing] = await db
        .select({ instanceId: collectionItems.instanceId })
        .from(collectionItems)
        .where(and(eq(collectionItems.userId, userId), eq(collectionItems.releaseId, discogsId)))
        .limit(1);
      if (existing) {
        throw new ProblemError(
          409,
          'already_in_collection',
          'Already on your shelf',
          'Add it again only if you own another copy.',
        );
      }
    }

    // Read before writing: an unknown release is a 404 with nothing written, and the
    // detail fills the shelf row the moment the copy exists.
    let instanceId: number;
    let detail;
    try {
      detail =
        (await this.cache.getFreshDetail(db, discogsId)) ??
        (await this.gateway.getRelease(owner.token, discogsId));
      ({ instanceId } = await this.gateway.addToCollection(
        owner.token,
        owner.user.discogsUsername,
        discogsId,
      ));
    } catch (error) {
      throw toProblem(error);
    }

    const dateAdded = new Date(this.clock.now());
    const cached = await runInTransaction(this.database.pool, async (tx) => {
      await tx.db
        .insert(collectionItems)
        .values({ userId, instanceId, releaseId: discogsId, dateAdded, lastSeenImportId: null })
        .onConflictDoNothing();
      await this.cache.store(tx.db, [detail]);
      return this.cache.storeDetail(tx.db, detail);
    });

    return {
      instanceId,
      dateAdded: dateAdded.toISOString(),
      release: {
        discogsId: cached.discogsId,
        title: cached.title,
        artists: cached.artists,
        year: cached.year,
        vinylColors: cached.vinylColors,
        coverImageUrl: cached.coverImageUrl,
        discogsUrl: cached.discogsUrl,
        fetchedAt: cached.fetchedAt.toISOString(),
        expiresAt: cached.expiresAt.toISOString(),
      },
    };
  }
}

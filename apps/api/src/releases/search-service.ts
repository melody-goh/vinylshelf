/**
 * Search Discogs for vinyl to add to the shelf (ADR 0009). Results pass straight
 * through: they are never stored, only marked with whether the release is already on
 * the user's shelf, and stamped with the same display deadline as any Discogs data.
 */
import type { SearchPage } from '@vinylshelf/contract';
import { and, eq, inArray } from 'drizzle-orm';
import type { UserRepository } from '../auth/users.js';
import type { Database } from '../db/client.js';
import { collectionItems } from '../db/schema.js';
import type { DiscogsGateway } from '../discogs/gateway.js';
import { toProblem } from '../discogs/problems.js';
import { ProblemError } from '../http/problem.js';
import type { Clock } from '../lib/clock.js';

export class SearchService {
  constructor(
    private readonly db: Database,
    private readonly gateway: DiscogsGateway,
    private readonly users: UserRepository,
    private readonly clock: Clock,
    /** The Discogs TTL; results expire like cached data would, though never cached. */
    private readonly ttlSeconds: number,
  ) {}

  async search(userId: string, query: string, page: number): Promise<SearchPage> {
    const owner = await this.users.accessToken(userId);
    if (!owner) throw new ProblemError(401, 'unauthenticated', 'Sign in required');

    let found;
    try {
      found = await this.gateway.searchReleases(owner.token, query, page);
    } catch (error) {
      throw toProblem(error);
    }

    const ids = found.results.map((r) => r.discogsId);
    const owned = new Set(
      ids.length === 0
        ? []
        : (
            await this.db
              .selectDistinct({ releaseId: collectionItems.releaseId })
              .from(collectionItems)
              .where(
                and(eq(collectionItems.userId, userId), inArray(collectionItems.releaseId, ids)),
              )
          ).map((row) => row.releaseId),
    );

    const fetchedAt = new Date(this.clock.now());
    const expiresAt = new Date(fetchedAt.getTime() + this.ttlSeconds * 1000);
    return {
      page: found.page,
      pages: found.pages,
      totalResults: found.totalResults,
      results: found.results.map((result) => ({
        ...result,
        inCollection: owned.has(result.discogsId),
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      })),
    };
  }
}

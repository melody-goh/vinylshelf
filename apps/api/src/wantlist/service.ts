/**
 * The user's Discogs wantlist (ADR 0011): read live a page at a time and never stored as
 * a list; adding and removing write to Discogs on an explicit action. The release
 * details each page carries go through the TTL cache like any Discogs data (ADR 0004).
 */
import type { WantlistItem, WantlistPage } from '@vinylshelf/contract';
import type { UserRepository } from '../auth/users.js';
import type { Database } from '../db/client.js';
import type { DiscogsReleaseCache } from '../discogs/cache.js';
import { DiscogsNotFoundError } from '../discogs/errors.js';
import type { DiscogsGateway, TokenPair, WantData } from '../discogs/gateway.js';
import { toProblem } from '../discogs/problems.js';
import { ProblemError } from '../http/problem.js';

export class WantlistService {
  constructor(
    private readonly db: Database,
    private readonly cache: DiscogsReleaseCache,
    private readonly gateway: DiscogsGateway,
    private readonly users: UserRepository,
  ) {}

  async list(userId: string, page: number): Promise<WantlistPage> {
    const owner = await this.owner(userId);
    let found;
    try {
      found = await this.gateway.getWantlistPage(owner.token, owner.username, page);
    } catch (error) {
      throw toProblem(error);
    }
    return {
      items: await this.toItems(found.wants),
      page: found.page,
      pages: found.pages,
      totalItems: found.totalItems,
    };
  }

  async add(userId: string, discogsId: number): Promise<WantlistItem> {
    const owner = await this.owner(userId);
    let want;
    try {
      want = await this.gateway.addToWantlist(owner.token, owner.username, discogsId);
    } catch (error) {
      throw toProblem(error);
    }
    const [item] = await this.toItems([want]);
    if (!item) throw new Error('A stored release vanished before it was read back');
    return item;
  }

  async remove(userId: string, discogsId: number): Promise<void> {
    const owner = await this.owner(userId);
    try {
      await this.gateway.removeFromWantlist(owner.token, owner.username, discogsId);
    } catch (error) {
      // Not wanted (or no such release): the outcome the user asked for already holds.
      if (error instanceof DiscogsNotFoundError) return;
      throw toProblem(error);
    }
  }

  private async owner(userId: string): Promise<{ token: TokenPair; username: string }> {
    const owner = await this.users.accessToken(userId);
    if (!owner) throw new ProblemError(401, 'unauthenticated', 'Sign in required');
    return { token: owner.token, username: owner.user.discogsUsername };
  }

  /** Caches the releases (restarting their TTL) and reads them back with their deadlines. */
  private async toItems(wants: readonly WantData[]): Promise<WantlistItem[]> {
    await this.cache.store(
      this.db,
      wants.map((w) => w.release),
    );
    const fresh = await this.cache.getFresh(
      this.db,
      wants.map((w) => w.releaseId),
    );
    return wants.flatMap((want) => {
      const release = fresh.get(want.releaseId);
      if (!release) return [];
      return [
        {
          dateAdded: want.dateAdded.toISOString(),
          release: {
            discogsId: release.discogsId,
            title: release.title,
            artists: release.artists,
            year: release.year,
            vinylColors: release.vinylColors,
            coverImageUrl: release.coverImageUrl,
            discogsUrl: release.discogsUrl,
            fetchedAt: release.fetchedAt.toISOString(),
            expiresAt: release.expiresAt.toISOString(),
          },
        },
      ];
    });
  }
}

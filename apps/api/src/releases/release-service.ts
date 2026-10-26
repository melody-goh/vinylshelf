/**
 * Release detail for the record view: served from the TTL-bound cache, fetched from
 * Discogs with the signed-in user's token when missing or expired (ADR 0004 §4).
 */
import type { Release } from '@vinylshelf/contract';
import type { UserRepository } from '../auth/users.js';
import type { Database } from '../db/client.js';
import type { CachedReleaseDetail, DiscogsReleaseCache } from '../discogs/cache.js';
import type { DiscogsGateway } from '../discogs/gateway.js';
import { toProblem } from '../discogs/problems.js';
import { ProblemError } from '../http/problem.js';

export class ReleaseService {
  constructor(
    private readonly db: Database,
    private readonly cache: DiscogsReleaseCache,
    private readonly gateway: DiscogsGateway,
    private readonly users: UserRepository,
  ) {}

  async get(userId: string, discogsId: number): Promise<CachedReleaseDetail> {
    const cached = await this.cache.getFreshDetail(this.db, discogsId);
    if (cached) return cached;

    const owner = await this.users.accessToken(userId);
    if (!owner) throw new ProblemError(401, 'unauthenticated', 'Sign in required');

    try {
      const detail = await this.gateway.getRelease(owner.token, discogsId);
      return await this.cache.storeDetail(this.db, detail);
    } catch (error) {
      throw toProblem(error);
    }
  }
}

/** The contract's Release shape. */
export function toReleaseDto(release: CachedReleaseDetail): Release {
  return {
    discogsId: release.discogsId,
    title: release.title,
    artists: release.artists,
    year: release.year,
    vinylColors: release.vinylColors,
    coverImageUrl: release.coverImageUrl,
    discogsUrl: release.discogsUrl,
    label: release.label,
    catalogNumber: release.catalogNumber,
    genres: release.genres,
    styles: release.styles,
    formats: release.formats,
    credits: release.credits,
    tracklist: release.tracklist,
    community: release.community,
    fetchedAt: release.fetchedAt.toISOString(),
    expiresAt: release.expiresAt.toISOString(),
  };
}

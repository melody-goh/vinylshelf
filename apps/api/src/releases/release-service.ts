/**
 * Release detail for the record view: served from the TTL-bound cache, fetched from
 * Discogs with the signed-in user's token when missing or expired (ADR 0004 §4).
 */
import type { Release } from '@vinylshelf/contract';
import type { UserRepository } from '../auth/users.js';
import type { Database } from '../db/client.js';
import type { CachedReleaseDetail, DiscogsReleaseCache } from '../discogs/cache.js';
import {
  DiscogsAuthError,
  DiscogsError,
  DiscogsNotFoundError,
  DiscogsRateLimitedError,
} from '../discogs/errors.js';
import type { DiscogsGateway } from '../discogs/gateway.js';
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

/** Discogs failures as the contract's documented answers (404, 401, 429, 503). */
function toProblem(error: unknown): unknown {
  if (error instanceof DiscogsNotFoundError) {
    return new ProblemError(404, 'release_not_found', 'Release not found on Discogs');
  }
  if (error instanceof DiscogsAuthError) {
    return new ProblemError(
      401,
      'discogs_auth_revoked',
      'Discogs access was revoked. Sign in again to continue.',
    );
  }
  if (error instanceof DiscogsRateLimitedError) {
    return new ProblemError(429, 'rate_limited', 'Discogs is busy. Try again shortly.', undefined, {
      'retry-after': String(error.retryAfterSeconds ?? 60),
    });
  }
  if (error instanceof DiscogsError) {
    return new ProblemError(503, 'discogs_unavailable', 'Discogs is unavailable. Try again later.');
  }
  return error;
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
    fetchedAt: release.fetchedAt.toISOString(),
    expiresAt: release.expiresAt.toISOString(),
  };
}

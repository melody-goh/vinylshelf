/**
 * 30-second previews for a release's tracks (ADR 0010): the release's tracklist from
 * Discogs, matched to an iTunes Store album, cached for a day so Apple's small budget
 * goes on records nobody has looked up yet.
 */
import type { ReleasePreviews } from '@vinylshelf/contract';
import { and, eq, gt, lte } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { itunesPreviewCache, type StoredPreviews } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { ITunesRateLimitedError, ITunesUnavailableError } from '../itunes/errors.js';
import type { ITunesGateway } from '../itunes/gateway.js';
import { chooseAlbum, matchTracks } from '../itunes/match.js';
import type { Clock } from '../lib/clock.js';
import type { ReleaseService } from './release-service.js';

/** How long a match (or a miss) is kept before Apple is asked again. */
export const PREVIEW_TTL_SECONDS = 24 * 60 * 60;

/** Apple requires this beside every preview (ADR 0010 §5). */
export const ITUNES_ATTRIBUTION = 'Previews provided courtesy of iTunes';

export class PreviewService {
  constructor(
    private readonly db: Database,
    private readonly releases: ReleaseService,
    private readonly itunes: ITunesGateway,
    private readonly clock: Clock,
  ) {}

  async get(userId: string, discogsId: number): Promise<ReleasePreviews> {
    const now = new Date(this.clock.now());
    const [cached] = await this.db
      .select()
      .from(itunesPreviewCache)
      .where(
        and(eq(itunesPreviewCache.discogsId, discogsId), gt(itunesPreviewCache.expiresAt, now)),
      )
      .limit(1);
    if (cached) return toDto(discogsId, cached.previews, cached.fetchedAt, cached.expiresAt);

    // The tracklist to match against; Discogs failures are already contract problems.
    const release = await this.releases.get(userId, discogsId);
    const previews = await this.lookUp(release);

    const expiresAt = new Date(now.getTime() + PREVIEW_TTL_SECONDS * 1000);
    await this.db
      .insert(itunesPreviewCache)
      .values({ discogsId, previews, fetchedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: itunesPreviewCache.discogsId,
        set: { previews, fetchedAt: now, expiresAt },
      });
    return toDto(discogsId, previews, now, expiresAt);
  }

  private async lookUp(release: {
    title: string;
    artists: string[];
    tracklist: { position: string; title: string }[];
  }): Promise<StoredPreviews> {
    const silent: StoredPreviews = {
      albumUrl: null,
      tracks: release.tracklist.map((t) => ({
        position: t.position,
        previewUrl: null,
        storeUrl: null,
      })),
    };
    try {
      const albums = await this.itunes.searchAlbums(
        [release.artists[0] ?? '', release.title].join(' ').trim(),
      );
      const album = chooseAlbum(albums, {
        title: release.title,
        artists: release.artists,
        trackCount: release.tracklist.length,
      });
      if (!album) return silent;
      const songs = await this.itunes.albumSongs(album.collectionId);
      return { albumUrl: album.storeUrl, tracks: matchTracks(release.tracklist, songs) };
    } catch (error) {
      if (error instanceof ITunesRateLimitedError) {
        throw new ProblemError(
          429,
          'rate_limited',
          'Previews are busy. Try again shortly.',
          undefined,
          { 'retry-after': String(error.retryAfterSeconds ?? 60) },
        );
      }
      if (error instanceof ITunesUnavailableError) {
        throw new ProblemError(503, 'previews_unavailable', 'Previews are unavailable right now.');
      }
      throw error;
    }
  }
}

/** Deletes matches past their day; runs with the Discogs cache purge. */
export async function purgeExpiredPreviews(db: Database, now: Date): Promise<number> {
  const deleted = await db
    .delete(itunesPreviewCache)
    .where(lte(itunesPreviewCache.expiresAt, now))
    .returning({ id: itunesPreviewCache.discogsId });
  return deleted.length;
}

function toDto(
  discogsId: number,
  previews: StoredPreviews,
  fetchedAt: Date,
  expiresAt: Date,
): ReleasePreviews {
  return {
    discogsId,
    albumUrl: previews.albumUrl,
    attribution: ITUNES_ATTRIBUTION,
    tracks: previews.tracks,
    fetchedAt: fetchedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

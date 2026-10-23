/**
 * The TTL-bound cache of Discogs release data (ADR 0004 §2–3). Compliance is code:
 *
 * - every row gets `expires_at = fetched_at + TTL`, with the TTL capped at 6 hours
 *   (here, in config validation, and by a database CHECK);
 * - every read filters on `expires_at > now`, through `freshReleaseCondition`, which
 *   other queries joining this table must use too;
 * - a scheduled job deletes expired rows (`purgeExpired`).
 */
import { and, gt, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { MAX_DISCOGS_TTL_SECONDS } from '../config.js';
import type { Database } from '../db/client.js';
import { discogsReleaseCache, type DiscogsClassification } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';
import type { ReleaseSummaryData } from './gateway.js';

export interface CachedRelease extends ReleaseSummaryData {
  classification: DiscogsClassification;
  fetchedAt: Date;
  expiresAt: Date;
}

/**
 * Release metadata is CC0, but a cover image URL is Restricted (ADR 0004). A row is
 * classified by its most restrictive field.
 */
export function classifyRelease(release: ReleaseSummaryData): DiscogsClassification {
  return release.coverImageUrl === null ? 'cc0' : 'restricted';
}

/** The only definition of "fresh". Use it in every query that reads cached releases. */
export function freshReleaseCondition(now: Date): SQL {
  return gt(discogsReleaseCache.expiresAt, now);
}

export class DiscogsReleaseCache {
  constructor(
    private readonly ttlSeconds: number,
    private readonly clock: Clock,
  ) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_DISCOGS_TTL_SECONDS) {
      throw new RangeError(`Discogs cache TTL must be 1..${MAX_DISCOGS_TTL_SECONDS} seconds`);
    }
  }

  now(): Date {
    return new Date(this.clock.now());
  }

  /**
   * Stores freshly fetched releases, restarting their TTL. `db` may be a transaction,
   * so an import page and its cache rows commit together.
   */
  async store(db: Database, releases: readonly ReleaseSummaryData[]): Promise<void> {
    // A collection can hold several copies of one release, and Postgres rejects an
    // upsert that touches the same row twice in one statement.
    const unique = [...new Map(releases.map((r) => [r.discogsId, r])).values()];
    if (unique.length === 0) return;

    const fetchedAt = this.now();
    const expiresAt = new Date(fetchedAt.getTime() + this.ttlSeconds * 1000);
    const rows = unique.map((r) => ({
      discogsId: r.discogsId,
      title: r.title,
      artists: r.artists,
      artistSort: (r.artists[0] ?? '').toLocaleLowerCase('en'),
      year: r.year,
      coverImageUrl: r.coverImageUrl,
      discogsUrl: r.discogsUrl,
      classification: classifyRelease(r),
      fetchedAt,
      expiresAt,
    }));

    await db
      .insert(discogsReleaseCache)
      .values(rows)
      .onConflictDoUpdate({
        target: discogsReleaseCache.discogsId,
        set: {
          title: sqlExcluded('title'),
          artists: sqlExcluded('artists'),
          artistSort: sqlExcluded('artist_sort'),
          year: sqlExcluded('year'),
          coverImageUrl: sqlExcluded('cover_image_url'),
          discogsUrl: sqlExcluded('discogs_url'),
          classification: sqlExcluded('classification'),
          fetchedAt: sqlExcluded('fetched_at'),
          expiresAt: sqlExcluded('expires_at'),
        },
      });
  }

  /** Fresh releases by Discogs id. Expired or unknown ids are simply absent. */
  async getFresh(db: Database, ids: readonly number[]): Promise<Map<number, CachedRelease>> {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select()
      .from(discogsReleaseCache)
      .where(
        and(inArray(discogsReleaseCache.discogsId, [...ids]), freshReleaseCondition(this.now())),
      );
    return new Map(
      rows.map((row) => [
        row.discogsId,
        {
          discogsId: row.discogsId,
          title: row.title,
          artists: row.artists,
          year: row.year,
          coverImageUrl: row.coverImageUrl,
          discogsUrl: row.discogsUrl,
          classification: row.classification,
          fetchedAt: row.fetchedAt,
          expiresAt: row.expiresAt,
        },
      ]),
    );
  }

  /**
   * Deletes rows past their deadline (ADR 0004 §3). Reads never return them anyway;
   * this keeps us from storing data longer than needed, and keeps the free-tier
   * database small (ADR 0005).
   */
  async purgeExpired(db: Database): Promise<number> {
    const deleted = await db
      .delete(discogsReleaseCache)
      .where(lte(discogsReleaseCache.expiresAt, this.now()))
      .returning({ id: discogsReleaseCache.discogsId });
    return deleted.length;
  }
}

/** `excluded.<column>` in an upsert: the value from the row being inserted. */
function sqlExcluded(column: string): SQL {
  return sql.raw(`excluded."${column}"`);
}

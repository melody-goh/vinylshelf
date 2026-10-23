/**
 * Stale-while-revalidate with a cutoff (ADR 0004 §4), expressed as the contract's
 * `CollectionRefresh`. A pure function: the rules can be read and tested on their own.
 */
import type { CollectionRefresh } from '@vinylshelf/contract';
import type { ImportJobRow } from './imports.js';

export interface ShelfFreshness {
  /** Shelf items whose cached release data is past `expires_at`, so withheld. */
  hiddenCount: number;
  /** Oldest `fetched_at` among the shelf's still-fresh cache rows. */
  oldestFetchedAt: Date | null;
}

export interface RefreshPolicy {
  /** Age at which visible data is refreshed in the background. */
  refreshAfterMs: number;
  /** After a failed import, how long to wait before starting another automatically. */
  cooldownMs: number;
}

export type RefreshDecision =
  | { action: 'none'; refresh: CollectionRefresh }
  /** Start (or join) an import, then report it as refreshing. */
  | { action: 'start' };

export function decideRefresh(
  freshness: ShelfFreshness,
  latest: ImportJobRow | null,
  now: number,
  policy: RefreshPolicy,
): RefreshDecision {
  const { hiddenCount } = freshness;
  const report = (refresh: Omit<CollectionRefresh, 'hiddenCount'>): RefreshDecision => ({
    action: 'none',
    refresh: { ...refresh, hiddenCount },
  });

  if (latest && (latest.status === 'queued' || latest.status === 'running')) {
    return report({ status: 'refreshing', importId: latest.id, retryAt: null });
  }

  const stale =
    hiddenCount > 0 ||
    (freshness.oldestFetchedAt !== null &&
      now - freshness.oldestFetchedAt.getTime() >= policy.refreshAfterMs);
  if (!stale) return report({ status: 'idle', importId: null, retryAt: null });

  // Do not hammer Discogs (and the shared rate limit) while it keeps failing.
  if (latest?.status === 'failed' && latest.finishedAt) {
    const retryAt = latest.finishedAt.getTime() + policy.cooldownMs;
    if (retryAt > now) {
      return report({
        status: 'backoff',
        importId: latest.id,
        retryAt: new Date(retryAt).toISOString(),
      });
    }
  }

  return { action: 'start' };
}

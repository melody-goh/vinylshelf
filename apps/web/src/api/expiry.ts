import type { CollectionItem } from '@vinylshelf/contract';
import { useEffect, useState } from 'react';

/** setTimeout cannot wait longer than this (about 24.8 days). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Items whose Discogs data is still within its display deadline. The contract says
 * clients MUST NOT show Discogs data after `expiresAt` (ADR 0004). The server already
 * withholds expired rows, but a tab left open would otherwise keep showing them, so
 * this also re-renders at the earliest deadline and calls `onExpire` to refetch.
 */
export function useUnexpired(items: CollectionItem[], onExpire: () => void): CollectionItem[] {
  const [now, setNow] = useState(() => Date.now());

  const fresh = items.filter((item) => Date.parse(item.release.expiresAt) > now);
  const nextExpiry = Math.min(...fresh.map((item) => Date.parse(item.release.expiresAt)));

  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(
      () => {
        setNow(Date.now());
        onExpire();
      },
      Math.min(Math.max(nextExpiry - Date.now(), 0), MAX_TIMEOUT_MS),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [nextExpiry, onExpire]);

  return fresh;
}

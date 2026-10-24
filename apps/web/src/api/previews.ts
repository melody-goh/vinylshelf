import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap } from './client';

/** How long a record must stay open before its previews are looked up. */
export const PREVIEW_DWELL_MS = 1200;

/**
 * 30-second previews for one release (ADR 0010). Apple allows about 20 lookups a
 * minute for the whole server, so they are fetched only for a record someone stays
 * with (or asks to hear), never for every record flicked past.
 */
export function usePreviews(discogsId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['previews', discogsId],
    queryFn: () =>
      unwrap(api.GET('/releases/{discogsId}/previews', { params: { path: { discogsId } } })),
    enabled,
    retry: false,
    staleTime: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      return expiresAt ? Math.max(Date.parse(expiresAt) - Date.now(), 0) : 0;
    },
  });
}

/** True once `key` has stayed the same for `ms`; false again as soon as it changes. */
export function useDwell(key: number, ms = PREVIEW_DWELL_MS): boolean {
  const [settled, setSettled] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSettled(key);
    }, ms);
    return () => {
      window.clearTimeout(id);
    };
  }, [key, ms]);
  return settled === key;
}

import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './client';

/**
 * One release in full, for the open gatefold. Discogs data expires (ADR 0004), so the
 * cached copy is considered stale exactly at its `expiresAt`, and refetched from then on.
 */
export function useRelease(discogsId: number | null) {
  return useQuery({
    queryKey: ['release', discogsId],
    queryFn: () =>
      unwrap(api.GET('/releases/{discogsId}', { params: { path: { discogsId: discogsId ?? 0 } } })),
    enabled: discogsId !== null,
    staleTime: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      return expiresAt ? Math.max(Date.parse(expiresAt) - Date.now(), 0) : 0;
    },
  });
}

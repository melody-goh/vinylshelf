import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap } from './client';
import { collectionKey } from './collection';

/** The shortest query the API accepts (openapi.yaml, searchReleases). */
export const MIN_QUERY = 2;

/** Waits for typing to pause, so each keystroke is not a Discogs request (ADR 0009 §5). */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      window.clearTimeout(id);
    };
  }, [value, delayMs]);
  return settled;
}

/**
 * One page of Discogs vinyl matching the query. Results are Discogs data passed
 * through, so they go stale at `expiresAt` like anything else from Discogs.
 */
export function useSearch(query: string, page: number) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q, page],
    queryFn: () => unwrap(api.GET('/search/releases', { params: { query: { q, page } } })),
    enabled: q.length >= MIN_QUERY,
    // Keep the last results up while the next query loads, instead of flashing empty.
    placeholderData: keepPreviousData,
    staleTime: (state) => {
      const expiresAt = state.state.data?.results[0]?.expiresAt;
      return expiresAt ? Math.max(Date.parse(expiresAt) - Date.now(), 0) : 0;
    },
  });
}

/**
 * Adds a release to the user's Discogs collection and shelf (ADR 0009). The shelf and
 * any search results (whose `inCollection` just changed) are refetched afterwards.
 */
export function useAddToShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { discogsId: number; allowDuplicate?: boolean }) =>
      unwrap(api.POST('/collection/items', { body: request })),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: collectionKey }),
        queryClient.invalidateQueries({ queryKey: ['search'] }),
      ]);
    },
  });
}

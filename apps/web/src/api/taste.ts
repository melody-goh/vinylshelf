import type { TasteFeedback } from '@vinylshelf/contract';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, unwrap } from './client';

export type Distance = 'near' | 'far';

export const tasteKey = ['taste'] as const;

/**
 * The shelf's rooms and their picks (ADR 0008), a page at a time; each page is every
 * room's next round. The same shelf and feedback always give the same pages, so they
 * are kept until feedback or the shelf changes them. Switching distance keeps the
 * previous row on screen until the new one arrives.
 */
export function useRecommendations(distance: Distance) {
  return useInfiniteQuery({
    queryKey: [...tasteKey, distance],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/taste/recommendations', { params: { query: { distance, page: pageParam } } }),
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

/**
 * "More like this" and "not for me". The picks are not worked out again while the
 * listener browses, so the row does not reshuffle under them; see `useRepickOnLeave`.
 */
export function useTasteFeedback() {
  const give = useMutation({
    mutationFn: (feedback: TasteFeedback) =>
      unwrap(api.POST('/taste/feedback', { body: feedback })),
  });
  const withdraw = useMutation({
    mutationFn: (masterId: number) =>
      unwrap(api.DELETE('/taste/feedback/{masterId}', { params: { path: { masterId } } })),
  });
  return { give, withdraw };
}

/**
 * Works the picks out again once the listener leaves, if they steered them while there.
 * The cleanup runs only on leaving, as long as the caller never turns `steered` back to
 * false; the query client does not change. (Refetching on every render instead looped: each answer is a
 * new served list, so it re-rendered, which refetched.)
 */
export function useRepickOnLeave(steered: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!steered) return;
    return () => {
      void queryClient.invalidateQueries({ queryKey: tasteKey });
    };
  }, [steered, queryClient]);
}

/**
 * Records that fit a description (ADR 0008 §2), for one submitted description at a
 * time. Kept, like the picks, so a row is not replaced under the listener when they
 * come back to the tab. Not retried: a 503 means search is not set up here, and asking
 * again will not change that.
 */
export function useTasteSearch(query: string | null) {
  return useInfiniteQuery({
    queryKey: ['taste-search', query],
    queryFn: ({ pageParam }) =>
      unwrap(api.GET('/taste/search', { params: { query: { q: query ?? '', page: pageParam } } })),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled: query !== null,
    staleTime: Infinity,
    retry: false,
  });
}

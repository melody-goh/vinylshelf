import type { TasteFeedback } from '@vinylshelf/contract';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './client';

export type Distance = 'near' | 'far';

export const tasteKey = ['taste'] as const;

/**
 * The shelf's rooms and their picks (ADR 0008). The same shelf and feedback always give
 * the same answer, so it is kept until feedback or the shelf changes it. Switching
 * distance keeps the previous row on screen until the new one arrives.
 */
export function useRecommendations(distance: Distance) {
  return useQuery({
    queryKey: [...tasteKey, distance],
    queryFn: () => unwrap(api.GET('/taste/recommendations', { params: { query: { distance } } })),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

/**
 * "More like this" and "not for me". Recommendations are refetched afterwards, but the
 * caller decides when to show them, so a row does not reshuffle under the listener.
 */
export function useTasteFeedback() {
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: tasteKey });
  const give = useMutation({
    mutationFn: (feedback: TasteFeedback) =>
      unwrap(api.POST('/taste/feedback', { body: feedback })),
  });
  const withdraw = useMutation({
    mutationFn: (masterId: number) =>
      unwrap(api.DELETE('/taste/feedback/{masterId}', { params: { path: { masterId } } })),
  });
  return { give, withdraw, settle };
}

/**
 * Records that fit a description (ADR 0008 §2), for one submitted description at a
 * time. Not retried: a 503 means search is not set up here, and asking again will not
 * change that.
 */
export function useTasteSearch(query: string | null) {
  return useQuery({
    queryKey: ['taste-search', query],
    queryFn: () => unwrap(api.GET('/taste/search', { params: { query: { q: query ?? '' } } })),
    enabled: query !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

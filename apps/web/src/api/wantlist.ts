import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './client';

export const wantlistKey = ['wantlist'] as const;

/** The Discogs wantlist, a page at a time, read live (ADR 0011). */
export function useWantlist(enabled = true) {
  return useInfiniteQuery({
    queryKey: wantlistKey,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET('/wantlist', { params: { query: { page: pageParam } } })),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled,
  });
}

/**
 * Adds or removes a release on the wantlist. The wantlist and any search results (whose
 * `inWantlist` just changed) are refetched afterwards.
 */
export function useWant() {
  const queryClient = useQueryClient();
  // Start the refetches without waiting for them, so whoever awaits the change (Acquired
  // switching to the shelf) carries on as soon as Discogs has it.
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: wantlistKey });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
  };
  const add = useMutation({
    mutationFn: (discogsId: number) =>
      unwrap(api.PUT('/wantlist/{discogsId}', { params: { path: { discogsId } } })),
    onSuccess: settle,
  });
  const remove = useMutation({
    mutationFn: async (discogsId: number) => {
      await unwrap(api.DELETE('/wantlist/{discogsId}', { params: { path: { discogsId } } }));
    },
    onSuccess: settle,
  });
  return { add, remove };
}

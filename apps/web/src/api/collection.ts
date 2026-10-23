import type { ImportJob, operations } from '@vinylshelf/contract';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './client';

export type CollectionSort = NonNullable<
  NonNullable<operations['listCollectionItems']['parameters']['query']>['sort']
>;

/** Timings in one place, so tests can shorten them instead of faking timers. */
export const timings = {
  /** How often a running import is polled for progress. */
  importPollMs: 1500,
};

const PAGE_SIZE = 50;

export const collectionKey = ['collection'] as const;

/** The shelf, a page at a time (cursor pagination from the API). */
export function useCollection(sort: CollectionSort) {
  return useInfiniteQuery({
    queryKey: [...collectionKey, sort],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/collection/items', {
          params: {
            query: { sort, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
          },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function isActive(job: ImportJob | undefined): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

/** One import job, polled while it is queued or running. */
export function useImportJob(importId: string | null) {
  return useQuery({
    queryKey: ['import', importId],
    queryFn: () =>
      unwrap(
        api.GET('/collection/imports/{importId}', {
          params: { path: { importId: importId ?? '' } },
        }),
      ),
    enabled: importId !== null,
    refetchInterval: (query) => (isActive(query.state.data) ? timings.importPollMs : false),
  });
}

/** Starts an import, or joins the one already running (the API is idempotent). */
export function useStartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/collection/imports')),
    onSuccess: (job) => {
      queryClient.setQueryData(['import', job.id], job);
    },
  });
}

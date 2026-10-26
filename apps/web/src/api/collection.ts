import type { ImportJob, operations } from '@vinylshelf/contract';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './client';

type ItemsQuery = NonNullable<operations['listCollectionItems']['parameters']['query']>;

export type CollectionSort = NonNullable<ItemsQuery['sort']>;

/** How each sort reads in a menu. */
export const SORT_LABELS: Record<CollectionSort, string> = {
  added_desc: 'Recently added',
  added_asc: 'First added',
  artist_asc: 'Artist A to Z',
  year_desc: 'Newest year',
  year_asc: 'Oldest year',
};

/** The library's filters; any left out do not narrow the shelf. */
export type ShelfFilters = Pick<ItemsQuery, 'genre' | 'style' | 'decade' | 'colourway'>;

/** Timings in one place, so tests can shorten them instead of faking timers. */
export const timings = {
  /** How often a running import is polled for progress. */
  importPollMs: 1500,
};

const PAGE_SIZE = 50;

export const collectionKey = ['collection'] as const;

/**
 * The shelf, a page at a time (cursor pagination from the API), optionally narrowed by
 * the library's filters.
 */
export function useCollection(sort: CollectionSort, filters: ShelfFilters = {}, limit = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: [...collectionKey, sort, filters, limit],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/collection/items', {
          params: {
            query: { sort, limit, ...filters, ...(pageParam ? { cursor: pageParam } : {}) },
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

/**
 * What the shelf can be filtered by, with counts. Kept under the collection's key, so a
 * sync or an added record refreshes it with the shelf.
 */
export function useFacets(enabled = true) {
  return useQuery({
    queryKey: [...collectionKey, 'facets'],
    queryFn: () => unwrap(api.GET('/collection/facets')),
    enabled,
    staleTime: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      return expiresAt ? Math.max(Date.parse(expiresAt) - Date.now(), 0) : 0;
    },
  });
}

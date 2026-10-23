import type { CollectionRefresh, ImportJob, User } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  collectionKey,
  isActive,
  useCollection,
  useImportJob,
  useStartImport,
  type CollectionSort,
} from '../api/collection';
import { useUnexpired } from '../api/expiry';
import { useLogout } from '../api/session';
import { ImportProgress } from '../components/ImportProgress';
import { ShelfItem } from '../components/ShelfItem';
import { ShelfSkeleton } from '../components/ShelfSkeleton';

const SORT_LABELS: Record<CollectionSort, string> = {
  added_desc: 'Recently added',
  added_asc: 'First added',
  artist_asc: 'Artist (A to Z)',
  year_desc: 'Year (newest first)',
  year_asc: 'Year (oldest first)',
};

/**
 * The user's shelf and everything around it: the first import, background refreshes
 * and the states of ADR 0004's stale-while-revalidate, as reported by the API in
 * `refresh` (idle / refreshing / backoff).
 */
export function Shelf({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [sort, setSort] = useState<CollectionSort>('added_desc');
  const collection = useCollection(sort);
  const startImport = useStartImport();
  // An import the user started from this screen, followed until it succeeds.
  const [startedImportId, setStartedImportId] = useState<string | null>(null);

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: collectionKey });
  }, [queryClient]);

  const pages = collection.data?.pages ?? [];
  const refresh: CollectionRefresh | undefined = pages[0]?.refresh;
  const items = useUnexpired(
    pages.flatMap((p) => p.items),
    reload,
  );

  // Follow the server's background refresh if there is one, else the user's own import.
  const followedImportId =
    refresh?.status === 'refreshing' && refresh.importId ? refresh.importId : startedImportId;
  const followedImport = useImportJob(followedImportId);
  const importing = followedImportId !== null && isActive(followedImport.data);

  const onImportFinished = useCallback(() => {
    // Keep a failed import on screen (it explains itself); clear a successful one.
    const job = queryClient.getQueryData<ImportJob>(['import', followedImportId]);
    if (job?.status === 'succeeded') setStartedImportId(null);
    reload();
  }, [queryClient, followedImportId, reload]);

  const begin = () => {
    startImport.mutate(undefined, {
      onSuccess: (job) => {
        setStartedImportId(job.id);
      },
    });
  };

  const isEmpty =
    items.length === 0 && refresh?.status === 'idle' && refresh.hiddenCount === 0 && !importing;

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{user.discogsUsername}&rsquo;s shelf</h1>
        <button
          type="button"
          onClick={() => {
            logout.mutate();
          }}
          disabled={logout.isPending}
          className="text-sm underline"
        >
          Sign out
        </button>
      </header>

      {collection.isPending ? (
        <p role="status">Loading your shelf…</p>
      ) : collection.isError ? (
        <p role="alert">Your shelf could not be loaded. Try again in a moment.</p>
      ) : (
        <>
          {followedImportId && (
            <ImportProgress importId={followedImportId} onFinished={onImportFinished} />
          )}

          {startImport.isError && (
            <p role="alert" className="text-red-800">
              The import could not be started. Try again in a moment.
            </p>
          )}

          {refresh?.status === 'backoff' && refresh.retryAt && (
            <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3">
              <p>
                Couldn&rsquo;t refresh {refresh.hiddenCount}{' '}
                {refresh.hiddenCount === 1 ? 'record' : 'records'} from Discogs. We&rsquo;ll try
                again automatically after{' '}
                {new Date(refresh.retryAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                .
              </p>
              <button
                type="button"
                onClick={begin}
                disabled={startImport.isPending || importing}
                className="mt-2 text-sm underline"
              >
                Try now
              </button>
            </div>
          )}

          {isEmpty ? (
            <div className="space-y-3">
              <p>Your shelf is empty. Import your collection from Discogs to fill it.</p>
              <button
                type="button"
                onClick={begin}
                disabled={startImport.isPending}
                className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
              >
                Import my collection
              </button>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                Sort by
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as CollectionSort);
                  }}
                  className="rounded border border-neutral-300 px-2 py-1"
                >
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {items.length > 0 && (
                <ul aria-label="Records" className="space-y-3">
                  {items.map((item) => (
                    <ShelfItem key={item.instanceId} item={item} />
                  ))}
                </ul>
              )}

              {refresh?.status === 'refreshing' && refresh.hiddenCount > 0 && (
                <ShelfSkeleton count={refresh.hiddenCount} />
              )}

              {collection.hasNextPage && (
                <button
                  type="button"
                  onClick={() => {
                    void collection.fetchNextPage();
                  }}
                  disabled={collection.isFetchingNextPage}
                  className="text-sm underline"
                >
                  {collection.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

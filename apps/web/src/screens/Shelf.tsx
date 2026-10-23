import type { CollectionItem, CollectionRefresh, ImportJob, User } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
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
import { ClosedSleeve } from '../components/ClosedSleeve';
import { DiscStack } from '../components/DiscStack';
import { DiscogsCredit } from '../components/DiscogsCredit';
import { Gatefold } from '../components/Gatefold';
import { HypeSticker } from '../components/HypeSticker';
import { ImportProgress } from '../components/ImportProgress';

const SORT_LABELS: Record<CollectionSort, string> = {
  added_desc: 'Recently added',
  added_asc: 'First added',
  artist_asc: 'Artist A to Z',
  year_desc: 'Newest year',
  year_asc: 'Oldest year',
};

const RETRY_TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * The user's shelf: one record open in the gatefold, the rest fanned beside it, plus
 * the first import, background refreshes and the states of ADR 0004's
 * stale-while-revalidate as the API reports them in `refresh`.
 */
export function Shelf({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [sort, setSort] = useState<CollectionSort>('added_desc');
  const collection = useCollection(sort);
  const startImport = useStartImport();
  // An import the user started from this screen, followed until it succeeds.
  const [startedImportId, setStartedImportId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<number | null>(null);

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: collectionKey });
  }, [queryClient]);

  const pages = collection.data?.pages ?? [];
  const refresh: CollectionRefresh | undefined = pages[0]?.refresh;
  const totalItems = pages[0]?.totalItems ?? 0;
  const items = useUnexpired(
    pages.flatMap((p) => p.items),
    reload,
  );
  const featured: CollectionItem | undefined =
    items.find((i) => i.instanceId === chosenId) ?? items[0];

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
  const refreshingCount = refresh?.status === 'refreshing' ? refresh.hiddenCount : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule px-4 py-3 md:px-8">
        <p className="condensed text-sm font-extrabold [font-stretch:62%]">Vinyl Shelf</p>
        <h1 className="sr-only">{user.discogsUsername}&rsquo;s shelf</h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {totalItems > 0 && (
            <p className="numerals text-ink-soft">
              {totalItems} {totalItems === 1 ? 'record' : 'records'}
            </p>
          )}
          {!isEmpty && (
            <label className="relative flex items-center gap-2">
              <span className="text-ink-soft">Sort by</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as CollectionSort);
                }}
                className="appearance-none bg-transparent pr-5 font-medium"
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-0 size-4"
              />
            </label>
          )}
          <span className="text-ink-soft">{user.discogsUsername}</span>
          <button
            type="button"
            onClick={() => {
              logout.mutate();
            }}
            disabled={logout.isPending}
            className="underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {collection.isPending ? (
        <p role="status" className="p-8">
          Taking your records off the shelf…
        </p>
      ) : collection.isError ? (
        <p role="alert" className="p-8">
          Your shelf couldn&rsquo;t be loaded. Try again in a moment.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(16rem,34%)]">
          <main className="order-2 flex min-h-0 flex-col gap-6 overflow-y-auto p-4 md:order-1 md:p-8">
            <Notices
              followedImportId={followedImportId}
              onImportFinished={onImportFinished}
              refresh={refresh}
              startFailed={startImport.isError}
              onRetry={begin}
              retryDisabled={startImport.isPending || importing}
            />

            {featured ? (
              <Gatefold item={featured} />
            ) : isEmpty ? (
              <ClosedSleeve
                heading="h2"
                title="Your shelf is empty"
                sticker={
                  <HypeSticker onClick={begin} disabled={startImport.isPending}>
                    Import my collection
                  </HypeSticker>
                }
              >
                <p>Bring your collection in from Discogs. It takes a minute for a large one.</p>
              </ClosedSleeve>
            ) : refreshingCount > 0 ? (
              <ClosedSleeve heading="h2" title="Back in a moment">
                <p>
                  Refreshing {refreshingCount} {refreshingCount === 1 ? 'record' : 'records'} from
                  Discogs…
                </p>
              </ClosedSleeve>
            ) : null}
          </main>

          {items.length + refreshingCount > 0 && (
            <aside
              aria-label="Your collection"
              className="relative order-1 min-h-0 border-b border-rule md:order-2 md:border-b-0 md:border-l"
            >
              {refreshingCount > 0 && featured && (
                <p role="status" className="px-4 pt-3 text-xs text-ink-soft md:px-6">
                  Refreshing {refreshingCount} {refreshingCount === 1 ? 'record' : 'records'} from
                  Discogs…
                </p>
              )}
              <DiscStack
                items={items}
                featuredId={featured?.instanceId ?? null}
                onChoose={(item) => {
                  setChosenId(item.instanceId);
                }}
                refreshingCount={refreshingCount}
                hasMore={collection.hasNextPage}
                loadingMore={collection.isFetchingNextPage}
                onLoadMore={() => {
                  void collection.fetchNextPage();
                }}
              />
              {featured && (
                <DiscogsCredit
                  href="https://www.discogs.com"
                  className="absolute bottom-3 right-4 bg-ground/90 px-1 text-ink-soft md:right-6"
                />
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function Notices({
  followedImportId,
  onImportFinished,
  refresh,
  startFailed,
  onRetry,
  retryDisabled,
}: {
  followedImportId: string | null;
  onImportFinished: () => void;
  refresh: CollectionRefresh | undefined;
  startFailed: boolean;
  onRetry: () => void;
  retryDisabled: boolean;
}) {
  return (
    <>
      {followedImportId && (
        <ImportProgress importId={followedImportId} onFinished={onImportFinished} />
      )}
      {startFailed && (
        <p role="alert" className="text-sm">
          The import couldn&rsquo;t be started. Try again in a moment.
        </p>
      )}
      {refresh?.status === 'backoff' && refresh.retryAt && (
        <div role="status" className="text-sm leading-relaxed">
          <p>
            Couldn&rsquo;t refresh {refresh.hiddenCount}{' '}
            {refresh.hiddenCount === 1 ? 'record' : 'records'} from Discogs. We&rsquo;ll try again
            automatically after {RETRY_TIME.format(new Date(refresh.retryAt))}.
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="mt-1 underline"
          >
            Try now
          </button>
        </div>
      )}
    </>
  );
}

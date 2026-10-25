import type { CollectionItem, CollectionRefresh, ImportJob, User } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  SORT_LABELS,
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
import { Gatefold } from '../components/Gatefold';
import { HypeSticker } from '../components/HypeSticker';
import { ImportProgress } from '../components/ImportProgress';
import { Library } from '../components/Library';
import { ScoredText } from '../components/ScoredText';
import { SearchField } from '../components/SearchField';
import { SearchResults } from '../components/SearchResults';
import { TextSelect } from '../components/TextSelect';

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
  // The record chosen on the stack, in search or in the library. Kept whole, because a
  // record chosen in the library may not be among the shelf's loaded pages.
  const [chosen, setChosen] = useState<CollectionItem | null>(null);
  const [view, setView] = useState<'shelf' | 'library'>('shelf');
  // While there is a query, search takes the gatefold's place (ADR 0009).
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;

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
    items.find((i) => i.instanceId === chosen?.instanceId) ??
    (chosen && items.length > 0 ? chosen : undefined) ??
    items[0];

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
        <div className="flex items-baseline gap-6">
          <p className="condensed text-sm font-extrabold [font-stretch:62%]">Vinyl Shelf</p>
          {!isEmpty && (
            <nav aria-label="Views" className="flex gap-4 text-sm">
              {(['shelf', 'library'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-current={view === name ? 'page' : undefined}
                  onClick={() => {
                    setView(name);
                  }}
                  className={
                    view === name ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink'
                  }
                >
                  {name === 'shelf' ? 'Shelf' : 'Library'}
                </button>
              ))}
            </nav>
          )}
        </div>
        <h1 className="sr-only">
          {user.discogsUsername}&rsquo;s {view === 'library' ? 'library' : 'shelf'}
        </h1>
        <SearchField
          value={query}
          onChange={setQuery}
          className="order-last w-full md:order-none md:w-auto md:max-w-sm md:flex-1"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {totalItems > 0 && (
            <p className="numerals text-ink-soft">
              {totalItems} {totalItems === 1 ? 'record' : 'records'}
            </p>
          )}
          {!isEmpty && view === 'shelf' && (
            <TextSelect
              label="Sort by"
              value={sort}
              options={Object.entries(SORT_LABELS).map(([value, label]) => ({
                value: value as CollectionSort,
                label,
              }))}
              onChange={setSort}
            />
          )}
          {!isEmpty && (
            // Changes made on discogs.com reach the shelf by re-importing; this does it now
            // rather than waiting for the automatic refresh (ADR 0004 §4).
            <button
              type="button"
              onClick={begin}
              disabled={startImport.isPending || importing}
              className="underline disabled:no-underline disabled:opacity-60"
            >
              {importing ? 'Syncing…' : 'Sync with Discogs'}
            </button>
          )}
          <span className="hidden text-ink-soft md:inline">{user.discogsUsername}</span>
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
        <div className="flex flex-1 items-center justify-center p-8">
          <ScoredText
            text="Taking your records off the shelf…"
            className="condensed max-w-[18ch] text-center text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold leading-[0.95] [font-stretch:62%]"
          />
        </div>
      ) : collection.isError ? (
        <p role="alert" className="p-8">
          Your shelf couldn&rsquo;t be loaded. Try again in a moment.
        </p>
      ) : view === 'library' && !isEmpty && !searching ? (
        <Library
          onOpen={(item) => {
            setChosen(item);
            setView('shelf');
          }}
          refreshingCount={refreshingCount}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(16rem,28%)]">
          <main
            className={`order-2 flex min-h-0 flex-col gap-6 overflow-y-auto p-4 md:order-1 md:items-center md:p-8 ${searching ? 'md:justify-start' : 'md:justify-center'}`}
          >
            {/* Notices and the gatefold share one width; two square panels sized to fit the height available. */}
            <div className="flex w-full flex-col gap-6 md:max-w-[calc((100dvh-10rem)*2)]">
              <Notices
                followedImportId={followedImportId}
                onImportFinished={onImportFinished}
                refresh={refresh}
                startFailed={startImport.isError}
                onRetry={begin}
                retryDisabled={startImport.isPending || importing}
              />

              {searching ? (
                <SearchResults
                  query={query}
                  onAdded={(item) => {
                    setQuery('');
                    setChosen(item);
                  }}
                />
              ) : featured ? (
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
            </div>
          </main>

          {isEmpty && (
            // Nothing to thumb through yet: the column stays, holding plain unlit discs.
            <div
              aria-hidden="true"
              className="order-2 hidden min-h-0 flex-col overflow-hidden border-l border-rule md:flex"
            >
              <DiscStack
                items={[]}
                featuredId={null}
                onChoose={() => undefined}
                refreshingCount={5}
                hasMore={false}
                loadingMore={false}
                onLoadMore={() => undefined}
              />
            </div>
          )}

          {items.length + refreshingCount > 0 && (
            <aside
              aria-label="Your collection"
              // On phones the row steps aside while searching, so results start at the top.
              className={`relative order-1 min-h-0 flex-col border-b border-rule md:order-2 md:flex md:border-b-0 md:border-l ${searching ? 'hidden' : 'flex'}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 pt-3 text-xs text-ink-soft md:px-6">
                {refreshingCount > 0 && featured && (
                  <p role="status">
                    Refreshing {refreshingCount} {refreshingCount === 1 ? 'record' : 'records'} from
                    Discogs…
                  </p>
                )}
              </div>
              <DiscStack
                items={items}
                featuredId={featured?.instanceId ?? null}
                onChoose={(item) => {
                  setChosen(item);
                }}
                refreshingCount={refreshingCount}
                hasMore={collection.hasNextPage}
                loadingMore={collection.isFetchingNextPage}
                onLoadMore={() => {
                  void collection.fetchNextPage();
                }}
              />
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

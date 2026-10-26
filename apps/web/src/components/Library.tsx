import type { CollectionItem } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collectionKey,
  SORT_LABELS,
  useCollection,
  useFacets,
  type CollectionSort,
  type ShelfFilters,
} from '../api/collection';
import { useUnexpired } from '../api/expiry';
import { useWideScreen } from '../design/media';
import { CoverGrid } from './CoverGrid';
import { Readout } from './Readout';
import { TextSelect } from './TextSelect';

const PAGE_SIZE = 100;
/** Stand-ins while loading, and at most this many for records refreshing. */
const PLACEHOLDERS = 24;
const ANY = '';

/**
 * The library: the whole vinyl shelf as a contact sheet of covers, for finding rather
 * than lingering. One quiet row of filters above it; covers only, named in the strip at
 * the foot as they are hovered. Choosing one opens it on the shelf. On arrival the
 * covers scatter in and settle into place.
 */
export function Library({
  onOpen,
  refreshingCount,
}: {
  onOpen: (item: CollectionItem) => void;
  refreshingCount: number;
}) {
  const wide = useWideScreen();
  const reduced = useReducedMotion() ?? false;
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<CollectionSort>('added_desc');
  const [filters, setFilters] = useState<ShelfFilters>({});
  const [leaning, setLeaning] = useState<CollectionItem | null>(null);
  /** The record in the middle of the view while scrolling; a hovered one takes over. */
  const [centred, setCentred] = useState<CollectionItem | null>(null);
  const collection = useCollection(sort, filters, PAGE_SIZE);
  const facets = useFacets().data;
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  /** The covers present on arrival scatter in; anything loaded later just appears. */
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setEntering(false);
    }, 1500);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: collectionKey });
  }, [queryClient]);
  const pages = collection.data?.pages ?? [];
  const items = useUnexpired(
    pages.flatMap((p) => p.items),
    reload,
  );
  const total = pages[0]?.totalItems ?? 0;
  const matched = pages[0]?.matchedItems ?? 0;
  const filtered = [filters.genre, filters.style, filters.decade, filters.colourway].some(
    (v) => v !== undefined,
  );
  const scatter = !reduced && entering;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = collection;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scroller.current, rootMargin: '600px' },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const set = (patch: ShelfFilters) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  return (
    <section aria-label="Library" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-x-6 overflow-x-auto px-4 pb-1 pt-4 text-sm [scrollbar-width:none] md:flex-wrap md:gap-y-2 md:overflow-visible md:px-8 md:pt-6">
        <TextSelect
          label="Genre"
          value={filters.genre ?? ANY}
          options={[
            { value: ANY, label: 'Any' },
            ...(facets?.genres ?? []).map((g) => ({
              value: g.name,
              label: g.name,
              count: g.count,
            })),
          ]}
          onChange={(genre) => {
            set({ genre: genre || undefined });
          }}
        />
        <TextSelect
          label="Style"
          value={filters.style ?? ANY}
          options={[
            { value: ANY, label: 'Any' },
            ...(facets?.styles ?? []).map((s) => ({
              value: s.name,
              label: s.name,
              count: s.count,
            })),
          ]}
          onChange={(style) => {
            set({ style: style || undefined });
          }}
        />
        <TextSelect
          label="Decade"
          value={filters.decade === undefined ? ANY : String(filters.decade)}
          options={[
            { value: ANY, label: 'Any' },
            ...(facets?.decades ?? []).map((d) => ({
              value: String(d.decade),
              label: `${String(d.decade)}s`,
              count: d.count,
            })),
          ]}
          onChange={(decade) => {
            set({ decade: decade ? Number(decade) : undefined });
          }}
        />
        <TextSelect
          label="Colour"
          value={filters.colourway ?? ANY}
          options={[
            { value: ANY, label: 'Any' },
            { value: 'coloured', label: 'Coloured', count: facets?.colourways.coloured ?? 0 },
            { value: 'black', label: 'Black', count: facets?.colourways.black ?? 0 },
          ]}
          onChange={(colourway) => {
            set({ colourway: colourway === ANY ? undefined : colourway });
          }}
        />
        <TextSelect
          label="Sort by"
          value={sort}
          options={Object.entries(SORT_LABELS).map(([value, label]) => ({
            value: value as CollectionSort,
            label,
          }))}
          onChange={setSort}
        />
        {filtered && (
          <p className="ml-auto flex shrink-0 items-center gap-4">
            <span role="status" className="numerals text-ink-soft">
              {matched} of {total}
            </span>
            <button
              type="button"
              onClick={() => {
                setFilters({});
              }}
              className="underline"
            >
              Clear
            </button>
          </p>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {collection.isPending ? (
          <ul
            aria-hidden="true"
            className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] md:gap-4"
          >
            {Array.from({ length: PLACEHOLDERS }, (_, i) => (
              <li key={i} className="aspect-square bg-rule/50" />
            ))}
          </ul>
        ) : filtered && items.length === 0 ? (
          <p className="text-sm">
            Nothing matches.{' '}
            <button
              type="button"
              onClick={() => {
                setFilters({});
              }}
              className="underline"
            >
              Clear
            </button>
          </p>
        ) : (
          <CoverGrid
            items={items}
            keyOf={(item) => item.instanceId}
            onChoose={onOpen}
            onLean={setLeaning}
            scroller={scroller}
            onCentre={setCentred}
            scatter={scatter}
            placeholders={Math.min(refreshingCount, PLACEHOLDERS)}
          />
        )}
        <div ref={sentinel} className="h-px" />
      </div>

      <Readout leaning={leaning ?? centred} wide={wide} />
    </section>
  );
}

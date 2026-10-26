import type { CollectionItem } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
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
import { describeRecord } from './DiscStack';
import { Readout } from './Readout';
import { TextSelect } from './TextSelect';

const PAGE_SIZE = 100;
/** Stand-ins while loading, and at most this many for records refreshing. */
const PLACEHOLDERS = 24;
/** Only the first screenful scatters in; later pages simply appear. */
const SCATTERED = 72;

const settle = { type: 'spring', stiffness: 110, damping: 17 } as const;
const lift = { type: 'spring', stiffness: 420, damping: 30 } as const;

const ANY = '';

/** A seeded spread for one cover's starting point, so the scatter is the same each time. */
function scatterFrom(index: number) {
  const r = (n: number) => {
    const x = Math.sin(index * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const w = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const h = typeof window === 'undefined' ? 800 : window.innerHeight;
  return {
    x: (r(1) - 0.5) * w * 0.9,
    y: (r(2) - 0.5) * h * 0.8,
    rotate: (r(3) - 0.5) * 36,
    scale: 0.55 + r(4) * 0.3,
    opacity: 0,
  };
}

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

  // Arrow keys move through the grid by its real columns, however wide the screen is.
  const onGridKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    const top = buttons[0]?.offsetTop ?? 0;
    const columns = Math.max(1, buttons.filter((b) => b.offsetTop === top).length);
    const next = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      ArrowDown: at + columns,
      ArrowUp: at - columns,
      Home: 0,
      End: buttons.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    buttons[Math.min(Math.max(next, 0), buttons.length - 1)]?.focus();
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
          <ul
            aria-label="Records"
            onKeyDown={onGridKey}
            className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] md:gap-4"
          >
            {items.map((item, index) => (
              <li key={item.instanceId}>
                <motion.button
                  type="button"
                  aria-label={describeRecord(item)}
                  onClick={() => {
                    onOpen(item);
                  }}
                  onHoverStart={() => {
                    setLeaning(item);
                  }}
                  onHoverEnd={() => {
                    setLeaning(null);
                  }}
                  onFocus={() => {
                    setLeaning(item);
                  }}
                  onBlur={() => {
                    setLeaning(null);
                  }}
                  initial={scatter && index < SCATTERED ? scatterFrom(index) : false}
                  animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
                  whileHover={{ y: -3, scale: 1.05 }}
                  whileFocus={{ y: -3, scale: 1.05 }}
                  transition={
                    scatter && index < SCATTERED
                      ? { ...settle, delay: Math.min(index * 0.008, 0.5) }
                      : lift
                  }
                  className="relative block aspect-square w-full overflow-hidden bg-carbon shadow-photo"
                >
                  {item.release.coverImageUrl ? (
                    <img
                      src={item.release.coverImageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="condensed absolute inset-1.5 overflow-hidden text-left text-[0.7rem] font-bold leading-tight text-ground">
                      {item.release.title}
                    </span>
                  )}
                </motion.button>
              </li>
            ))}
            {Array.from({ length: Math.min(refreshingCount, PLACEHOLDERS) }, (_, i) => (
              <li
                key={`unlit-${String(i)}`}
                aria-hidden="true"
                className="aspect-square bg-rule/60"
              />
            ))}
          </ul>
        )}
        <div ref={sentinel} className="h-px" />
      </div>

      <Readout leaning={leaning} wide={wide} />
    </section>
  );
}

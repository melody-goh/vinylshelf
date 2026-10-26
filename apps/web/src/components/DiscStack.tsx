import type { CollectionItem, ReleaseSummary } from '@vinylshelf/contract';
import { motion, type Transition } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useWideScreen } from '../design/media';
import { Disc } from './Disc';
import { Readout } from './Readout';

/** At most this many unlit stand-ins, however many records are refreshing. */
const MAX_UNLIT = 8;

const pull: Transition = { type: 'spring', stiffness: 420, damping: 34 };

interface DiscStackProps {
  items: CollectionItem[];
  /** The instance open in the gatefold. */
  featuredId: number | null;
  onChoose: (item: CollectionItem) => void;
  /** Records withheld while their Discogs data refreshes (shown unlit). */
  refreshingCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/** A record's accessible name: title, artists and year. */
export function describeRecord(item: { release: ReleaseSummary }): string {
  const { release } = item;
  return `${release.title}, ${release.artists.join(', ')}, ${release.year ?? 'year unknown'}`;
}

/**
 * The rest of the collection, fanned beside the open gatefold like records laid out for
 * a photograph: each disc overlaps the next, showing a crescent. Leaning on one (hover or
 * keyboard focus) slides it half out of the stack and reads its title out below the
 * stack, clear of the discs; choosing it opens it in the gatefold. Vertical beside the
 * gatefold on wide screens, a row above it on narrow ones.
 */
export function DiscStack({
  items,
  featuredId,
  onChoose,
  refreshingCount,
  hasMore,
  loadingMore,
  onLoadMore,
}: DiscStackProps) {
  const wide = useWideScreen();
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [leaning, setLeaning] = useState<CollectionItem | null>(null);

  // Fetch the next page as the end of the stack comes into view.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore) onLoadMore();
      },
      { root: scroller.current, rootMargin: '400px' },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadingMore, onLoadMore]);

  const pulled = wide ? { x: '-36%' } : { y: '28%' };
  const featured = wide ? { x: '-10%' } : { y: '8%' };
  const unlit = Math.min(refreshingCount, MAX_UNLIT);

  return (
    <>
      <div
        ref={scroller}
        className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-6 pt-2 [--disc:9.5rem] [--peek:2.75rem] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:px-0 md:pb-8 md:pl-[38%] md:[--disc:15rem] md:[--peek:3.25rem]"
      >
        <ul aria-label="Records" className="flex md:flex-col">
          {items.map((item, index) => {
            const isFeatured = item.instanceId === featuredId;
            return (
              <li
                key={item.instanceId}
                className="relative shrink-0 first:ml-0 first:mt-0 [margin-left:calc(var(--peek)-var(--disc))] md:ml-0 md:[margin-top:calc(var(--peek)-var(--disc))]"
                style={{ zIndex: items.length - index }}
              >
                <motion.button
                  type="button"
                  aria-label={describeRecord(item)}
                  aria-current={isFeatured ? 'true' : undefined}
                  onClick={() => {
                    onChoose(item);
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
                  initial="rest"
                  animate={isFeatured ? 'featured' : 'rest'}
                  whileHover="pulled"
                  whileFocus="pulled"
                  variants={{ rest: { x: 0, y: 0 }, featured, pulled }}
                  transition={pull}
                  className="group relative block w-[var(--disc)] cursor-pointer rounded-full"
                >
                  <Disc
                    vinylColors={item.release.vinylColors}
                    labelImageUrl={item.release.coverImageUrl ?? null}
                    seed={item.release.discogsId}
                  />
                </motion.button>
              </li>
            );
          })}
          {Array.from({ length: unlit }, (_, i) => (
            <li
              key={`unlit-${String(i)}`}
              aria-hidden="true"
              className="relative shrink-0 [margin-left:calc(var(--peek)-var(--disc))] first:ml-0 md:ml-0 md:[margin-top:calc(var(--peek)-var(--disc))] md:first:mt-0"
              style={{ zIndex: 0 }}
            >
              <Disc vinylColors={[]} unlit className="w-[var(--disc)]" />
            </li>
          ))}
        </ul>
        <div ref={sentinel} className="h-px w-px shrink-0" />
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="condensed mt-4 shrink-0 self-center text-xs underline disabled:no-underline disabled:opacity-60"
          >
            {loadingMore ? 'Loading records…' : 'Load more records'}
          </button>
        )}
      </div>
      {items.length > 0 && <Readout leaning={leaning} wide={wide} />}
    </>
  );
}

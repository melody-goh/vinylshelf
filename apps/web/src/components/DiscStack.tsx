import type { CollectionItem } from '@vinylshelf/contract';
import { motion, type Transition } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useWideScreen } from '../design/media';
import { Disc } from './Disc';

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

export function describeRecord(item: CollectionItem): string {
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

/** A slow, never-ending drift: a spring with no bounce, mirrored back and forth. */
const drift = {
  type: 'spring',
  visualDuration: 12,
  bounce: 0,
  repeat: Infinity,
  repeatType: 'mirror',
} as const;

/**
 * A holographic wash, like light across iridescent foil: broad pastel fields from round
 * the rainbow that overlap and melt into each other. Two layers drift past each other at
 * different speeds, so the blend keeps changing and never settles into a pattern.
 */
const WASHES = [
  'radial-gradient(38% 160% at 8% 40%, #f9c6a6, transparent 70%), radial-gradient(38% 160% at 40% 65%, #f2e397, transparent 70%), radial-gradient(38% 160% at 70% 35%, #b2daf3, transparent 70%), radial-gradient(38% 160% at 96% 60%, #c8bcf3, transparent 70%)',
  'radial-gradient(34% 150% at 24% 30%, #f1badb, transparent 70%), radial-gradient(34% 150% at 56% 55%, #b1e6c8, transparent 70%), radial-gradient(34% 150% at 86% 40%, #e9c3ea, transparent 70%)',
];

const DRIFTS = [
  {
    from: { x: '-9%', y: '-6%' },
    to: { x: '8%', y: '5%' },
    seconds: 11,
  },
  {
    from: { x: '7%', y: '6%' },
    to: { x: '-8%', y: '-5%' },
    seconds: 17,
  },
];

/**
 * The leaned record, named where it covers nothing: the strip under the stack, washed
 * in a pastel rainbow that drifts on its own so the eye finds it. The button carries
 * the accessible name, so this is for sighted readers only. Before anything is leaned
 * it says how.
 */
function Readout({ leaning, wide }: { leaning: CollectionItem | null; wide: boolean }) {
  return (
    <div aria-hidden="true" className="relative shrink-0 overflow-hidden border-t border-rule">
      {/* Oversized layers, moved, never repainted: transform only. */}
      <div className="absolute inset-0 bg-[#eef0f7]" />
      {WASHES.map((background, i) => (
        <motion.div
          key={background}
          className={`absolute -inset-[45%] ${i === 1 ? 'opacity-75' : ''}`}
          style={{ background }}
          initial={DRIFTS[i]?.from}
          animate={DRIFTS[i]?.to}
          transition={{ ...drift, visualDuration: DRIFTS[i]?.seconds ?? 12 }}
        />
      ))}
      <p className="relative min-h-11 px-4 py-2 text-sm leading-tight md:px-6 md:py-3">
        {leaning ? (
          <>
            <span className="block font-semibold">{leaning.release.title}</span>
            <span className="block text-xs text-ink-soft">
              {leaning.release.artists.join(', ')}
              {leaning.release.year ? ` · ${String(leaning.release.year)}` : ''}
            </span>
          </>
        ) : (
          <span className="block pt-1.5 text-xs text-ink-soft">
            {wide ? 'Hover over a record to see what it is' : 'Tap a record to open it'}
          </span>
        )}
      </p>
    </div>
  );
}

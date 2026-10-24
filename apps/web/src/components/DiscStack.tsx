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
 * Two layers of pastel splotches across the rainbow. Each drifts on its own
 * spring, at different speeds, so the colours keep mixing without a visible pattern.
 */
const SPLOTCHES = [
  'radial-gradient(13% 60% at 18% 30%, #fbb1b1, transparent 72%), radial-gradient(12% 57% at 52% 70%, #b6e8ad, transparent 72%), radial-gradient(14% 66% at 82% 26%, #b0c6f7, transparent 72%), radial-gradient(10% 51% at 36% 86%, #f9e68c, transparent 72%), radial-gradient(11% 54% at 70% 92%, #d2b6f4, transparent 72%)',
  'radial-gradient(12% 57% at 30% 62%, #fcc897, transparent 72%), radial-gradient(13% 63% at 64% 22%, #a4e1ec, transparent 72%), radial-gradient(11% 54% at 88% 70%, #f4b0d6, transparent 72%), radial-gradient(10% 45% at 10% 80%, #c8ecae, transparent 72%), radial-gradient(12% 60% at 48% 40%, #f7d9a0, transparent 72%)',
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
      {/* Oversized layers, moved and turned, never repainted: transform only. */}
      <div className="absolute inset-0 bg-[#f6f1f4]" />
      {SPLOTCHES.map((background, i) => (
        <motion.div
          key={background}
          className="absolute -inset-[45%]"
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

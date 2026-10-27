import type { ReleaseSummary } from '@vinylshelf/contract';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { HOLO_RING } from '../design/holo';
import { describeRecord } from './DiscStack';

/** Only the first screenful scatters in; later pages simply appear. */
const SCATTERED = 72;

const settle = { type: 'spring', stiffness: 110, damping: 17 } as const;
const lift = { type: 'spring', stiffness: 420, damping: 30 } as const;
/** Covers follow the scroll a beat behind, so the sheet feels weighted, not dragged. */
const follow = { stiffness: 260, damping: 38 } as const;

/**
 * The scroll focus: covers in the middle band of the view are at full size and
 * strength, easing down towards the edges. Gentle on purpose: the sheet must still read
 * as a whole collection.
 */
const BAND = 0.6;
const EDGE_SCALE = 0.92;
const EDGE_OPACITY = 0.55;

/** Where each cover's centre sits in the scroller's content, and how tall the view is. */
interface Layout {
  centres: Map<number, { x: number; y: number }>;
  view: number;
  /** The view's width, for finding the one cover nearest its middle. */
  width: number;
  /** Only a sheet taller than its view has a middle to focus on. */
  scrolls: boolean;
}

function focusAt(layout: Layout, key: number, scrolled: number): number {
  const centre = layout.centres.get(key);
  if (!layout.scrolls || centre === undefined) return 1;
  const distance = Math.abs(centre.y - (scrolled + layout.view / 2)) / (layout.view * BAND);
  const near = Math.max(0, 1 - distance);
  return near * near * (3 - 2 * near);
}

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

/** Arrow keys move through a grid by its real columns, however wide the screen is. */
function onGridKey(event: KeyboardEvent<HTMLUListElement>) {
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
}

/**
 * A contact sheet of covers on the studio ground (the library, the wantlist): covers
 * only, lifting with a holographic glow on hover or focus, each a button named for its
 * record; a chosen one keeps the glow inside a holographic rim. When `scatter`
 * is on, the first screenful arrives tumbling in and settles into place.
 */
export function CoverGrid<T extends { release: ReleaseSummary }>({
  items,
  keyOf,
  onChoose,
  onLean,
  scatter,
  selectedKey,
  placeholders = 0,
  scroller,
  onCentre,
}: {
  items: readonly T[];
  keyOf: (item: T) => number;
  onChoose: (item: T) => void;
  onLean: (item: T | null) => void;
  scatter: boolean;
  /** A chosen cover stays lifted. */
  selectedKey?: number | null;
  /** Unlit squares after the covers, for records still refreshing. */
  placeholders?: number;
  /** The scrolling box the sheet sits in; with it, covers focus towards its middle. */
  scroller?: RefObject<HTMLElement | null>;
  /** The record nearest the middle of the view, named as the sheet scrolls. */
  onCentre?: (item: T | null) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const list = useRef<HTMLUListElement>(null);
  const layout = useRef<Layout>({ centres: new Map(), view: 0, width: 0, scrolls: false });
  const { scrollY } = useScroll(scroller ? { container: scroller } : {});
  const scrolled = useSpring(scrollY, follow);
  /** Bumped when covers move (a resize, more loaded), so focus is worked out again. */
  const measured = useMotionValue(0);

  // Where every cover sits, measured again whenever the sheet or its view resizes.
  useLayoutEffect(() => {
    const box = scroller?.current;
    const ul = list.current;
    if (!box || !ul) return;
    const measure = () => {
      const frame = box.getBoundingClientRect();
      const top = frame.top - box.scrollTop;
      const centres = new Map<number, { x: number; y: number }>();
      ul.querySelectorAll<HTMLElement>('li[data-key]').forEach((li) => {
        const rect = li.getBoundingClientRect();
        centres.set(Number(li.dataset.key), {
          x: rect.left - frame.left + rect.width / 2,
          y: rect.top - top + rect.height / 2,
        });
      });
      layout.current = {
        centres,
        view: box.clientHeight,
        width: box.clientWidth,
        scrolls: box.scrollHeight > box.clientHeight + 1,
      };
      measured.set(measured.get() + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(ul);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, [items, scroller, measured]);

  // Name the record in the middle as the sheet moves, and light it so the name has a
  // face; only scrolling does this, and a hovered cover takes over.
  const [centredKey, setCentredKey] = useState<number | null>(null);
  useMotionValueEvent(scrollY, 'change', (y) => {
    const { centres, view, width, scrolls } = layout.current;
    if (!onCentre || !scrolls) return;
    let best: T | null = null;
    let bestDistance = Infinity;
    for (const item of items) {
      const centre = centres.get(keyOf(item));
      if (!centre) continue;
      const distance = Math.hypot(centre.x - width / 2, centre.y - (y + view / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    const key = best ? keyOf(best) : null;
    if (key !== centredKey) {
      setCentredKey(key);
      onCentre(best);
    }
  });

  return (
    <ul
      ref={list}
      aria-label="Records"
      onKeyDown={onGridKey}
      className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] md:gap-4"
    >
      {items.map((item, index) => {
        const scattering = scatter && index < SCATTERED;
        const selected = selectedKey === keyOf(item);
        return (
          <Focused
            key={keyOf(item)}
            id={keyOf(item)}
            scrolled={scrolled}
            measured={measured}
            layout={layout}
            still={reduced || !scroller}
          >
            <motion.button
              type="button"
              aria-label={describeRecord(item)}
              aria-pressed={selectedKey === undefined ? undefined : selected}
              onClick={() => {
                onChoose(item);
              }}
              onHoverStart={() => {
                onLean(item);
              }}
              onHoverEnd={() => {
                onLean(null);
              }}
              onFocus={() => {
                onLean(item);
              }}
              onBlur={() => {
                onLean(null);
              }}
              initial={scattering ? scatterFrom(index) : false}
              animate={selected ? 'selected' : centredKey === keyOf(item) ? 'lean' : 'rest'}
              whileHover="lean"
              whileFocus="lean"
              variants={{
                rest: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
                lean: { y: -3, scale: 1.05 },
                selected: { x: 0, y: -4, rotate: 0, scale: 1.07, opacity: 1 },
              }}
              transition={scattering ? { ...settle, delay: Math.min(index * 0.008, 0.5) } : lift}
              className="relative isolate block w-full"
            >
              {/* A holographic glow blooms behind a leaned cover and stays with a chosen one. */}
              <motion.span
                aria-hidden="true"
                className="absolute -inset-3 -z-20 blur-xl"
                style={{ background: HOLO_RING }}
                variants={{
                  rest: { opacity: 0 },
                  lean: { opacity: 1 },
                  selected: { opacity: 1 },
                }}
                transition={lift}
              />
              {/* A chosen cover is rimmed in the same colours, not outlined in ink. */}
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 -z-10"
                  style={{ background: HOLO_RING }}
                />
              )}
              <span className="relative block aspect-square overflow-hidden bg-carbon shadow-photo">
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
              </span>
            </motion.button>
          </Focused>
        );
      })}
      {Array.from({ length: placeholders }, (_, i) => (
        <li key={`unlit-${String(i)}`} aria-hidden="true" className="aspect-square bg-rule/60" />
      ))}
    </ul>
  );
}

/** One cover's place in the sheet, sized and faded by how near the middle of the view it is. */
function Focused({
  id,
  scrolled,
  measured,
  layout,
  still,
  children,
}: {
  id: number;
  scrolled: MotionValue<number>;
  measured: MotionValue<number>;
  layout: RefObject<Layout>;
  still: boolean;
  children: ReactNode;
}) {
  const focus = useTransform([scrolled, measured], ([y]: number[]) =>
    still ? 1 : focusAt(layout.current, id, y ?? 0),
  );
  const scale = useTransform(focus, (f) => EDGE_SCALE + (1 - EDGE_SCALE) * f);
  const opacity = useTransform(focus, (f) => EDGE_OPACITY + (1 - EDGE_OPACITY) * f);
  return (
    <motion.li data-key={id} style={{ scale, opacity }}>
      {children}
    </motion.li>
  );
}

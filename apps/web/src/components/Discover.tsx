import type { TastePick, TasteRecommendations, TasteRoom } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { useExpired } from '../api/expiry';
import { useRelease } from '../api/releases';
import { useRecommendations, type Distance } from '../api/taste';
import { useWideScreen } from '../design/media';
import { MissingCover } from './MissingCover';
import { TextSelect } from './TextSelect';

/** One pick in the row, with the room it was found for. */
export interface Placed {
  pick: TastePick;
  room: TasteRoom;
}

/** Every room's picks in one row, room after room, largest room first. */
export function placeAll(recommendations: TasteRecommendations | undefined): Placed[] {
  return (recommendations?.rooms ?? []).flatMap((room) =>
    room.picks.map((pick) => ({ pick, room })),
  );
}

const travel = { type: 'spring', stiffness: 170, damping: 24 } as const;

/** Each sleeve behind the front one is this much smaller than the one before it. */
const RECEDE = 0.74;
/** Sleeves further back than this have faded out. */
const DEPTH = 5;
/** Covers are fetched (from Discogs, rate-limited) only this near the front. */
const COVERS_BEHIND = 3;
const COVERS_AHEAD = 1;
/** A wheel gesture moves one sleeve once it has travelled this far. */
const WHEEL_STEP = 60;
const WHEEL_REST_MS = 320;

/**
 * Where a sleeve sits for its place relative to the front one: the front sleeve large and
 * turned slightly to face the reader; those already passed recede to the left, each
 * smaller and turned further away; the next one waits small at the right edge.
 */
export function placement(offset: number, size: number, anchor: number) {
  // Every sleeve stands on the same line as the front one, so the smaller ones sit low.
  const standing = (scale: number) => (size * (1 - scale)) / 2;
  if (offset === 0) return { x: anchor, y: 0, scale: 1, rotateY: -16, opacity: 1, z: 100 };
  if (offset > 0) {
    const scale = offset === 1 ? 0.5 : 0.35;
    return {
      x: anchor + size * (offset === 1 ? 0.95 : 1.4),
      y: standing(scale),
      scale,
      rotateY: -10,
      opacity: offset === 1 ? 1 : 0,
      z: 100 - offset,
    };
  }
  const depth = -offset;
  const scale = RECEDE ** depth;
  // Each step back moves left by a gap that shrinks with the sleeve.
  const travelled = (size * 0.66 * (1 - scale)) / (1 - RECEDE);
  return {
    x: anchor - travelled,
    y: standing(scale),
    scale,
    rotateY: -26,
    opacity: depth > DEPTH ? 0 : 1,
    z: 100 - depth,
  };
}

/**
 * Discover (ADR 0008): the taste engine's picks as one row of sleeves receding into the
 * distance, the front one large with its liner notes and the reason it was picked. Room
 * after room, so the room's name changes as the row moves. Arrow keys, the wheel or a
 * click on a sleeve bring it to the front.
 */
export function Discover() {
  const [distance, setDistance] = useState<Distance>('near');
  const recommendations = useRecommendations(distance);
  const placed = useMemo(() => placeAll(recommendations.data), [recommendations.data]);
  const [front, setFront] = useState(0);
  const data = recommendations.data;

  // A new row (another distance, or after feedback) starts from its first pick.
  const [shown, setShown] = useState(placed);
  if (shown !== placed) {
    setShown(placed);
    setFront(0);
  }

  const reach = (
    <TextSelect
      label="Reach"
      value={distance}
      options={[
        { value: 'near', label: 'Near' },
        { value: 'far', label: 'Far' },
      ]}
      onChange={setDistance}
    />
  );

  if (recommendations.isPending) {
    return <Quiet>Reading your records…</Quiet>;
  }
  if (recommendations.isError || !data) {
    return (
      <Quiet role="alert">
        Recommendations couldn&rsquo;t be worked out just now. Try again soon.
      </Quiet>
    );
  }
  if (data.status === 'no_catalogue') {
    return <Quiet>Discover needs the taste catalogue, which isn&rsquo;t loaded here yet.</Quiet>;
  }
  if (data.status === 'too_few_records') {
    return (
      <Quiet>
        Discover needs at least three of your records in its catalogue. It knows{' '}
        {data.basedOn.inCatalogue} so far.
      </Quiet>
    );
  }
  if (placed.length === 0) {
    return (
      <Quiet>
        Nothing to suggest right now.
        <span className="mt-4 block">{reach}</span>
      </Quiet>
    );
  }

  const current = placed[Math.min(front, placed.length - 1)];
  if (!current) return null;
  return (
    <Row
      placed={placed}
      front={Math.min(front, placed.length - 1)}
      onFront={setFront}
      current={current}
      reach={reach}
    />
  );
}

function Quiet({ children, role }: { children: ReactNode; role?: 'alert' }) {
  return (
    <section aria-label="Discover" className="grid flex-1 place-items-center p-8">
      <p role={role} className="max-w-md text-center text-sm text-ink-soft">
        {children}
      </p>
    </section>
  );
}

function Row({
  placed,
  front,
  onFront,
  current,
  reach,
}: {
  placed: Placed[];
  front: number;
  onFront: (index: number) => void;
  current: Placed;
  reach: ReactNode;
}) {
  const wide = useWideScreen();
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const wheel = useRef({ travelled: 0, restUntil: 0 });

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      setBox({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const go = (index: number) => {
    onFront(Math.min(Math.max(index, 0), placed.length - 1));
  };

  // Arrow keys move the row wherever focus is, unless it is somewhere that types.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const next =
        event.key === 'ArrowRight' ? front + 1 : event.key === 'ArrowLeft' ? front - 1 : null;
      if (next === null) return;
      event.preventDefault();
      onFront(Math.min(Math.max(next, 0), placed.length - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [front, onFront, placed.length]);

  // One sleeve per wheel gesture, however long the gesture runs on.
  const onWheel = (event: WheelEvent) => {
    const now = performance.now();
    if (now < wheel.current.restUntil) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    wheel.current.travelled += delta;
    if (Math.abs(wheel.current.travelled) < WHEEL_STEP) return;
    go(front + Math.sign(wheel.current.travelled));
    wheel.current = { travelled: 0, restUntil: now + WHEEL_REST_MS };
  };

  // Sizes follow the stage: the front sleeve fills about half its height.
  const size = wide
    ? Math.min(box.height * 0.62, box.width * 0.34)
    : Math.min(box.width * 0.56, box.height * 0.8);
  const anchor = (wide ? box.width * 0.64 : box.width * 0.5) - size / 2;
  // The front sleeve sits a little below the middle, leaving the notes room above the row.
  const top = wide ? box.height - size - Math.max(72, box.height * 0.1) : (box.height - size) / 2;

  return (
    <section
      aria-label="Discover"
      onWheel={onWheel}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:block"
    >
      <div className="relative z-[200] flex flex-col gap-4 p-4 md:absolute md:left-8 md:top-6 md:w-[22rem] md:p-0">
        <Notes current={current} />
      </div>

      <div ref={stage} className="relative h-[52vh] shrink-0 md:absolute md:inset-0 md:h-auto">
        {box.width > 0 &&
          placed.map((item, index) => {
            const offset = index - front;
            if (offset < -(DEPTH + 1) || offset > 2) return null;
            return (
              <Sleeve
                key={`${item.room.id}-${String(item.pick.master.masterId)}`}
                item={item}
                at={placement(offset, size, anchor)}
                top={top}
                size={size}
                isFront={offset === 0}
                withCover={offset >= -COVERS_BEHIND && offset <= COVERS_AHEAD}
                onChoose={() => {
                  go(index);
                }}
              />
            );
          })}
      </div>

      <div className="relative z-[200] flex items-center justify-between gap-6 px-4 pb-4 text-sm md:absolute md:inset-x-8 md:bottom-6 md:p-0">
        {reach}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous record"
            disabled={front === 0}
            onClick={() => {
              go(front - 1);
            }}
            className="grid size-9 place-items-center rounded-full text-ink disabled:opacity-30"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <span className="numerals text-ink-soft">
            {front + 1} / {placed.length}
          </span>
          <button
            type="button"
            aria-label="Next record"
            disabled={front === placed.length - 1}
            onClick={() => {
              go(front + 1);
            }}
            className="grid size-9 place-items-center rounded-full text-ink disabled:opacity-30"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

/** The front record's liner notes: which side of the shelf, what it is, and why. */
function Notes({ current }: { current: Placed }) {
  const { master, reason } = current.pick;
  return (
    <div aria-live="polite">
      <p className="condensed text-[0.7rem] text-ink-soft">{current.room.styles.join(' · ')}</p>
      <h2 className="mt-2 text-[clamp(1.75rem,3.2vw,2.75rem)] font-bold leading-[1.02] tracking-[-0.02em] [text-wrap:balance]">
        {master.title}
      </h2>
      <dl className="mt-4">
        <Note label="Artist">
          {master.artists.map((artist) => (
            <span key={artist} className="block">
              {artist}
            </span>
          ))}
        </Note>
        {master.year != null && (
          <Note label="Year">
            <span className="numerals">{master.year}</span>
          </Note>
        )}
        {master.labels[0] && <Note label="Label">{master.labels[0]}</Note>}
        <Note label="Why">
          {reason.text}
          {reason.shelfTitles.length > 1 && (
            <span className="mt-0.5 block text-ink-soft">{reason.shelfTitles.join(', ')}</span>
          )}
        </Note>
      </dl>
    </div>
  );
}

/** One line of the notes, as in the Listening Room: label left, value set right, hairline above. */
function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-ink/70 py-2">
      <dt className="condensed shrink-0 text-[0.7rem] text-ink-soft">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

function Sleeve({
  item,
  at,
  top,
  size,
  isFront,
  withCover,
  onChoose,
}: {
  item: Placed;
  at: ReturnType<typeof placement>;
  top: number;
  size: number;
  isFront: boolean;
  withCover: boolean;
  onChoose: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const { master } = item.pick;
  const queryClient = useQueryClient();
  // The catalogue has no images: the cover comes from the record's main release.
  const release = useRelease(withCover ? master.mainReleaseId : null);
  const expired = useExpired(release.data?.expiresAt, () => {
    void queryClient.invalidateQueries({ queryKey: ['release', master.mainReleaseId] });
  });
  const cover = expired ? null : (release.data?.coverImageUrl ?? null);
  const { z, ...target } = at;

  return (
    <motion.button
      type="button"
      aria-label={`${master.title}, ${master.artists.join(', ')}, ${String(master.year ?? 'year unknown')}`}
      aria-current={isFront ? 'true' : undefined}
      tabIndex={isFront ? 0 : -1}
      onClick={onChoose}
      initial={false}
      animate={reduced ? { ...target, rotateY: 0 } : target}
      transition={reduced ? { duration: 0 } : travel}
      className="absolute left-0 origin-center overflow-hidden bg-carbon shadow-photo"
      style={{ top, width: size, height: size, zIndex: z, transformPerspective: 1400 }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <MissingCover title={master.title} artists={master.artists} />
      )}
    </motion.button>
  );
}

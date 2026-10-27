import type { TastePick, TasteRecommendations, TasteRoom } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from 'motion/react';
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
import { useDwell, usePreviews } from '../api/previews';
import { useRelease } from '../api/releases';
import { useRecommendations, useTasteFeedback, type Distance } from '../api/taste';
import { useWant } from '../api/wantlist';
import { useWideScreen } from '../design/media';
import type { Release, TasteFeedback } from '@vinylshelf/contract';

type TasteVerdict = TasteFeedback['verdict'];
import { Disc } from './Disc';
import { ListeningRoom, playableTracks, type Playable } from './ListeningRoom';
import { MissingCover } from './MissingCover';
import { Quaver, ScoredText } from './ScoredText';
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

/** Letters and digits only, so "Rejoice (Remastered)" still matches "Rejoice". */
const plain = (title: string) =>
  title
    .replace(/\s*[([].*?[)\]]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * The one track to hear on the page, chosen as a record shop would: the title track if
 * the record has one with a preview, otherwise the first track that has one (albums
 * were sequenced to open strong). Nothing knows which track a listener would like best;
 * this is honest about that.
 */
export function featuredTrack(
  release: Pick<Release, 'title'>,
  tracks: readonly Playable[],
): { track: Playable; why: 'title' | 'opening' } | null {
  const title = plain(release.title);
  const named = title ? tracks.find((t) => plain(t.title) === title) : undefined;
  if (named) return { track: named, why: 'title' };
  const [first] = tracks;
  return first ? { track: first, why: 'opening' } : null;
}

const travel = { type: 'spring', stiffness: 170, damping: 24 } as const;
/** How far a playing disc slides out of the front sleeve, as a share of the sleeve. */
const PEEK = 0.42;
/** 33⅓ revolutions a minute. */
const DEGREES_PER_SECOND = (100 / 3) * 6;
const press = { type: 'spring', stiffness: 500, damping: 28 } as const;

/** The front sleeve's turn towards the reader; the Listening Room draws the disc from it. */
const FRONT_TILT = -16;
/** The loading line is held for one pass of its notes, but never longer than this. */
const HOLD_LIMIT_MS = 4000;

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
  if (offset === 0) return { x: anchor, y: 0, scale: 1, rotateY: FRONT_TILT, opacity: 1, z: 100 };
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
 * distance, the front one large with its liner notes and why it was picked: its sound,
 * whose fans it is for, and any real link to the shelf. Room
 * after room, so the room's name changes as the row moves. Arrow keys, the wheel or a
 * click on a sleeve bring it to the front.
 */
export function Discover() {
  const [distance, setDistance] = useState<Distance>('near');
  const recommendations = useRecommendations(distance);
  const all = useMemo(() => placeAll(recommendations.data), [recommendations.data]);
  const [front, setFront] = useState(0);
  // Verdicts given on this visit. "Not for me" takes a record out of the row at once;
  // the next visit's picks are worked out with every verdict (ADR 0008).
  const [verdicts, setVerdicts] = useState<ReadonlyMap<number, TasteVerdict>>(new Map());
  const placed = useMemo(
    () => all.filter((p) => verdicts.get(p.pick.master.masterId) !== 'less'),
    [all, verdicts],
  );
  const feedback = useTasteFeedback();
  const { settle } = feedback;
  const steered = verdicts.size > 0;
  useEffect(
    () => () => {
      if (steered) void settle();
    },
    [steered, settle],
  );
  const data = recommendations.data;
  // The first visit holds the loading line for one pass of its notes, so it is seen.
  const [held, setHeld] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setHeld(false);
    }, HOLD_LIMIT_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  // A new row (another distance, or after feedback) starts from its first pick.
  const [shown, setShown] = useState(all);
  if (shown !== all) {
    setShown(all);
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

  if (recommendations.isPending || held) {
    return (
      <section aria-label="Discover" className="grid flex-1 place-items-center p-6">
        <ScoredText
          text="Digging through the crates…"
          className="condensed max-w-[18ch] text-center text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold leading-[0.95] [font-stretch:62%]"
          onPass={() => {
            setHeld(false);
          }}
        />
      </section>
    );
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
        Discover needs at least three of your records, or records you want, in its catalogue. It
        knows {data.basedOn.inCatalogue + (data.basedOn.wanted ?? 0)} so far.
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
      verdict={verdicts.get(current.pick.master.masterId) ?? null}
      onVerdict={(verdict) => {
        const { masterId } = current.pick.master;
        const next = new Map(verdicts);
        if (verdict === null) {
          next.delete(masterId);
          feedback.withdraw.mutate(masterId);
        } else {
          next.set(masterId, verdict);
          feedback.give.mutate({ masterId, verdict });
        }
        setVerdicts(next);
      }}
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
  verdict,
  onVerdict,
}: {
  placed: Placed[];
  front: number;
  onFront: (index: number) => void;
  current: Placed;
  reach: ReactNode;
  verdict: TasteVerdict | null;
  /** null takes a verdict back. */
  onVerdict: (verdict: TasteVerdict | null) => void;
}) {
  const wide = useWideScreen();
  const stage = useRef<HTMLDivElement>(null);

  // The front record's one track, looked up once it has been in front a moment.
  const { mainReleaseId, masterId } = current.pick.master;
  const detail = useRelease(mainReleaseId).data;
  const previews = usePreviews(mainReleaseId, useDwell(mainReleaseId));
  const tracks = detail && previews.data ? playableTracks(detail, previews.data) : null;
  const featured = detail && tracks ? featuredTrack(detail, tracks) : null;
  // Autoplay: off until the listener plays a record (or switches it on); while it is on,
  // each record brought to the front plays its track, until they pause.
  const [listening, setListening] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const [room, setRoom] = useState<{ from: DOMRect | null; startAt: string } | null>(null);
  const url = featured?.track.previewUrl;

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    if (listening && url) void el.play().catch(() => undefined);
    else el.pause();
  }, [listening, url, masterId]);
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
        <Preview
          featured={featured}
          missing={tracks !== null && featured === null}
          playing={playing}
          onToggle={() => {
            setListening(!playing);
            if (playing) audio.current?.pause();
            else if (url) void audio.current?.play().catch(() => undefined);
          }}
        />
        <Actions
          key={masterId}
          mainReleaseId={mainReleaseId}
          canOpen={featured !== null}
          verdict={verdict}
          onVerdict={onVerdict}
          onAlbum={() => {
            if (!featured) return;
            setListening(false);
            const frame = stage.current?.getBoundingClientRect();
            setRoom({
              from: frame ? new DOMRect(frame.left + anchor, frame.top + top, size, size) : null,
              startAt: featured.track.position,
            });
          }}
        />
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
                spinning={offset === 0 && playing}
                disc={offset === 0 ? (detail ?? null) : null}
                withCover={offset >= -COVERS_BEHIND && offset <= COVERS_AHEAD}
                onChoose={() => {
                  go(index);
                }}
              />
            );
          })}
      </div>

      <div className="relative z-[200] flex items-center justify-between gap-6 px-4 pb-4 text-sm md:absolute md:inset-x-8 md:bottom-6 md:p-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {reach}
          <TextSelect
            label="Autoplay"
            value={listening ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
            onChange={(value) => {
              setListening(value === 'on');
            }}
          />
        </div>
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

      {/* Streamed from Apple, never stored (ADR 0010 §4). */}
      <audio
        ref={audio}
        src={url}
        preload="none"
        onPlay={() => {
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
        }}
      />
      {room && detail && previews.data && (
        <ListeningRoom
          release={detail}
          previews={previews.data}
          startAt={room.startAt}
          from={room.from}
          fromTilt={FRONT_TILT}
          onClose={() => {
            setRoom(null);
          }}
        />
      )}
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
        <Note label="Sound">{reason.sound}</Note>
        {reason.fansOf.length > 0 && (
          <Note label="For fans of">
            {reason.fansOf.map((artist) => (
              <span key={artist} className="block">
                {artist}
              </span>
            ))}
          </Note>
        )}
        {reason.link && <Note label="Link">{reason.link.text}</Note>}
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
  spinning,
  disc,
  withCover,
  onChoose,
}: {
  item: Placed;
  at: ReturnType<typeof placement>;
  top: number;
  size: number;
  isFront: boolean;
  /** Playing: the disc slides part way out of the sleeve and turns. */
  spinning: boolean;
  /** The front record's release, for its disc's colourway; null for the others. */
  disc: Release | null;
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
  const { z, rotateY, ...target } = at;

  // The button moves along the row; the sleeve inside it turns about its own centre, so
  // every sleeve is foreshortened alike wherever it stands.
  return (
    <motion.button
      type="button"
      aria-label={`${master.title}, ${master.artists.join(', ')}, ${String(master.year ?? 'year unknown')}`}
      aria-current={isFront ? 'true' : undefined}
      tabIndex={isFront ? 0 : -1}
      onClick={onChoose}
      initial={false}
      animate={target}
      transition={reduced ? { duration: 0 } : travel}
      className="absolute left-0"
      style={{ top, width: size, height: size, zIndex: z }}
    >
      <motion.span
        initial={false}
        animate={{ rotateY: reduced ? 0 : rotateY }}
        transition={reduced ? { duration: 0 } : travel}
        className="relative block h-full w-full"
        style={{ transformPerspective: 1400 }}
      >
        {disc && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-[3%] block"
            initial={false}
            animate={{ x: spinning ? size * PEEK : 0 }}
            transition={reduced ? { duration: 0 } : travel}
          >
            <Turning on={spinning && !reduced}>
              <Disc
                vinylColors={disc.vinylColors}
                labelImageUrl={disc.coverImageUrl ?? null}
                seed={disc.discogsId}
                className="w-full"
              />
            </Turning>
          </motion.span>
        )}
        <span className="relative block h-full w-full overflow-hidden bg-carbon shadow-photo">
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
        </span>
      </motion.span>
    </motion.button>
  );
}

/** A disc turning at 33⅓ while it plays, and holding still when it stops. */
function Turning({ on, children }: { on: boolean; children: ReactNode }) {
  const rotate = useMotionValue(0);
  useAnimationFrame((_, delta) => {
    if (on) rotate.set(rotate.get() + (delta / 1000) * DEGREES_PER_SECOND);
  });
  return (
    <motion.span className="block" style={{ rotate }}>
      {children}
    </motion.span>
  );
}

/**
 * Hearing the front record without leaving the row: one track, played on the page, and
 * the whole record in the Listening Room for when it hooks the listener (ADR 0010).
 */
function Preview({
  featured,
  missing,
  playing,
  onToggle,
}: {
  featured: ReturnType<typeof featuredTrack>;
  /** Previews were looked up and there are none. */
  missing: boolean;
  playing: boolean;
  onToggle: () => void;
}) {
  if (missing) return <p className="text-sm text-ink-soft">No previews for this record.</p>;
  const title = featured?.track.title;
  return (
    <div>
      <div className="flex items-center gap-3 border-t border-ink/70 py-2">
        <Quaver className="size-5 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{title ?? '\u00a0'}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {featured ? (featured.why === 'title' ? 'Title track' : 'Opening track') : '\u00a0'}
          </p>
        </div>
        <motion.button
          type="button"
          disabled={!featured}
          aria-busy={!featured}
          aria-label={title ? `${playing ? 'Pause' : 'Play'} ${title}` : 'Preview'}
          onClick={onToggle}
          whileHover={featured ? { scale: 1.06 } : {}}
          whileTap={featured ? { scale: 0.95 } : {}}
          transition={press}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-sticker text-sticker-ink shadow-photo disabled:opacity-50"
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-4 fill-current" />
          ) : (
            <Play aria-hidden="true" className="ml-0.5 size-4 fill-current" />
          )}
        </motion.button>
      </div>
    </div>
  );
}

/**
 * What to do with the front record: hear all of it, want it, or steer the picks. Each is
 * a quiet text action; a given verdict is set in ink and can be taken back.
 */
function Actions({
  mainReleaseId,
  canOpen,
  verdict,
  onVerdict,
  onAlbum,
}: {
  mainReleaseId: number;
  canOpen: boolean;
  verdict: TasteVerdict | null;
  onVerdict: (verdict: TasteVerdict | null) => void;
  onAlbum: () => void;
}) {
  const want = useWant();
  const wanted = want.add.isSuccess;
  const action = (on: boolean) =>
    `underline-offset-2 ${on ? 'font-semibold text-ink' : 'text-ink-soft hover:text-ink'}`;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
      {canOpen && (
        <button type="button" onClick={onAlbum} className="underline">
          Full album
        </button>
      )}
      <button
        type="button"
        aria-pressed={wanted}
        disabled={wanted || want.add.isPending}
        onClick={() => {
          want.add.mutate(mainReleaseId);
        }}
        className={action(wanted)}
      >
        {wanted ? 'Wanted' : want.add.isPending ? 'Wanting…' : 'Want'}
      </button>
      <button
        type="button"
        aria-pressed={verdict === 'more'}
        onClick={() => {
          onVerdict(verdict === 'more' ? null : 'more');
        }}
        className={action(verdict === 'more')}
      >
        More like this
      </button>
      <button
        type="button"
        onClick={() => {
          onVerdict('less');
        }}
        className={action(false)}
      >
        Not for me
      </button>
      {want.add.isError && (
        <span role="alert" className="basis-full text-ink-soft">
          Couldn&rsquo;t reach Discogs just now. Nothing changed.
        </span>
      )}
    </div>
  );
}

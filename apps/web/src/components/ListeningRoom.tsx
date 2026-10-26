import type { Release, ReleasePreviews } from '@vinylshelf/contract';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import appleMusicBadge from '../design/listen-on-apple-music.svg';
import { Disc } from './Disc';
import { DiscogsCredit } from './DiscogsCredit';

/** Every iTunes preview is (about) this long; the ruler gives each track this span. */
const PREVIEW_SECONDS = 30;
/** 33⅓ revolutions a minute. */
const DEGREES_PER_SECOND = (100 / 3) * 6;
const TICKS = 72;
/** How far around the cursor ticks rise, as a share of the ruler, and how much. */
const REACH = 0.07;
const RISE = 1.6;
const STEP_SECONDS = 5;

const press = { type: 'spring', stiffness: 500, damping: 28 } as const;
/** The tabs' travelling dot, reused for the track that is playing. */
const trackSlide = { type: 'spring', stiffness: 420, damping: 34 } as const;

export interface Playable {
  position: string;
  title: string;
  previewUrl: string;
}

/** The tracks Apple has a preview for, in tracklist order (ADR 0010). */
export function playableTracks(release: Release, previews: ReleasePreviews): Playable[] {
  return release.tracklist.flatMap((track, i) => {
    const match = previews.tracks[i];
    return match?.position === track.position && match.previewUrl
      ? [{ position: track.position, title: track.title, previewUrl: match.previewUrl }]
      : [];
  });
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The listening room: the record alone on the studio ground, its disc turning at 33⅓
 * while a preview plays, and one ruler across the whole record to scrub through it.
 * Dragging the cursor cues the record by hand: the disc turns with it, forwards or
 * back, and picks up its spin again on release. Previews stream from Apple and are
 * shown with Apple's attribution and badge (ADR 0010 §5).
 */
export function ListeningRoom({
  release,
  previews,
  startAt,
  onClose,
}: {
  release: Release;
  previews: ReleasePreviews;
  /** Position of the track to start with. */
  startAt: string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const tracks = useMemo(() => playableTracks(release, previews), [release, previews]);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      tracks.findIndex((t) => t.position === startAt),
    ),
  );
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** The track and second under the cursor: where it plays, or where a drag points. */
  const [at, setAt] = useState({ track: index, seconds: 0 });
  const audio = useRef<HTMLAudioElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  /** Seek to apply once the next track's audio is ready. */
  const pendingSeek = useRef<number | null>(null);
  /** Whether a track change should keep playing. */
  const keepPlaying = useRef(true);
  const drag = useRef<{ last: number; wasPlaying: boolean } | null>(null);

  const count = tracks.length;
  const current = tracks[index];
  /** Where the cursor is, from 0 (first track's start) to 1 (last track's end). */
  const progress = useMotionValue(count ? index / count : 0);
  const rotation = useMotionValue(0);

  // Time moves the cursor and, while playing, turns the disc. Dragging owns both.
  useAnimationFrame((_, delta) => {
    const el = audio.current;
    if (!el || dragging || count === 0) return;
    const length = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : PREVIEW_SECONDS;
    progress.set((index + Math.min(el.currentTime / length, 1)) / count);
    if (!el.paused && !reduced) rotation.set(rotation.get() + (delta / 1000) * DEGREES_PER_SECOND);
  });

  // The title, readout and slider value follow the cursor, at a calmer rate than frames,
  // so a drag names the track it is over before anything plays there.
  useMotionValueEvent(progress, 'change', (p) => {
    if (count === 0) return;
    const track = Math.min(count - 1, Math.max(0, Math.floor(p * count)));
    const seconds = Math.round(
      Math.min(Math.max((p * count - track) * PREVIEW_SECONDS, 0), PREVIEW_SECONDS),
    );
    setAt((prev) => (prev.track === track && prev.seconds === seconds ? prev : { track, seconds }));
  });

  const seekTo = useCallback(
    (fraction: number) => {
      if (count === 0) return;
      const f = Math.min(Math.max(fraction, 0), 0.99999);
      const target = Math.min(count - 1, Math.floor(f * count));
      const within = (f * count - target) * PREVIEW_SECONDS;
      progress.set(f);
      if (target === index) {
        const el = audio.current;
        if (el) el.currentTime = within;
      } else {
        pendingSeek.current = within;
        setIndex(target);
      }
    },
    [count, index, progress],
  );

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const step = useCallback(
    (by: number) => {
      if (count === 0) return;
      const next = index + by;
      if (next < 0 || next >= count) return;
      keepPlaying.current = !(audio.current?.paused ?? true);
      progress.set(next / count);
      setIndex(next);
    },
    [count, index, progress],
  );

  // A new track: load it and keep playing if we were. The browser waits for the data
  // itself; only a pending seek has to wait until the track's length is known.
  useEffect(() => {
    const el = audio.current;
    if (!el || !current) return;
    el.load();
    const onReady = () => {
      if (pendingSeek.current !== null) {
        el.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
    };
    el.addEventListener('loadedmetadata', onReady, { once: true });
    if (keepPlaying.current) void el.play().catch(() => undefined);
    return () => {
      el.removeEventListener('loadedmetadata', onReady);
    };
  }, [current]);

  // The room is modal: the page under it does not scroll, focus starts on the ruler and
  // goes back where it was when the room closes.
  useEffect(() => {
    const before = document.activeElement;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    ruler.current?.focus();
    return () => {
      root.style.overflow = overflow;
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);

  const fractionAt = (event: PointerEvent) => {
    const rect = ruler.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return progress.get();
    return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const el = audio.current;
    drag.current = { last: fractionAt(event), wasPlaying: !(el?.paused ?? true) };
    el?.pause();
    setDragging(true);
    progress.set(drag.current.last);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const f = fractionAt(event);
    // Cueing by hand: the disc turns as far as the record would in that much time.
    if (!reduced) {
      const moved = (f - drag.current.last) * count * PREVIEW_SECONDS;
      rotation.set(rotation.get() + moved * DEGREES_PER_SECOND);
    }
    drag.current.last = f;
    progress.set(f);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    keepPlaying.current = drag.current.wasPlaying;
    const resume = drag.current.wasPlaying;
    drag.current = null;
    setDragging(false);
    seekTo(progress.get());
    if (resume) void audio.current?.play().catch(() => undefined);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const onButton =
      event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement;
    const total = count * PREVIEW_SECONDS;
    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case ' ':
        if (onButton) return;
        toggle();
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
        if (onButton || total === 0) return;
        seekTo(progress.get() + ((event.key === 'ArrowRight' ? 1 : -1) * STEP_SECONDS) / total);
        break;
      case ']':
        step(1);
        break;
      case '[':
        step(-1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  if (!current) return null;

  const shown = tracks[at.track] ?? current;
  const seconds = at.track === index || dragging ? at.seconds : 0;
  const first = tracks[0];
  const last = tracks[count - 1];
  const playableAt = new Map(tracks.map((t, i) => [t.position, i]));

  const playTrack = (target: number) => {
    keepPlaying.current = true;
    progress.set(target / count);
    if (target === index) {
      const el = audio.current;
      if (el) {
        el.currentTime = 0;
        void el.play().catch(() => undefined);
      }
    } else {
      setIndex(target);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Listening Room: ${release.title}`}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ground"
    >
      <header className="flex items-center justify-between px-4 py-3 md:px-8">
        <p className="condensed text-sm font-extrabold [font-stretch:62%]">Listening Room</p>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 grid size-10 place-items-center rounded-full text-ink-soft hover:text-ink"
          aria-label="Close the listening room"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-12 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] md:gap-16 md:px-10">
        <div className="flex flex-col items-center gap-6 md:gap-7">
          {/* The record, floating over its own shadow on the seamless ground. */}
          <div className="flex w-[min(40vh,72vw,26rem)] flex-col items-center">
            <motion.div className="w-full" style={{ rotate: rotation }}>
              <Disc
                vinylColors={release.vinylColors}
                labelImageUrl={release.coverImageUrl ?? null}
                seed={release.discogsId}
                className="w-full"
              />
            </motion.div>
            <div
              aria-hidden="true"
              className="mt-6 h-5 w-[78%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(20_20_20/0.22),transparent)] blur-[6px]"
            />
          </div>

          <p className="text-center text-lg font-semibold leading-snug [text-wrap:balance]">
            <span className="condensed numerals mr-2 text-[0.7rem] font-normal text-ink-soft">
              {shown.position}
            </span>
            {shown.title}
          </p>

          <div className="w-full max-w-xl">
            <div
              ref={ruler}
              role="slider"
              tabIndex={0}
              aria-label="Position in the record"
              aria-valuemin={0}
              aria-valuemax={count * PREVIEW_SECONDS}
              aria-valuenow={at.track * PREVIEW_SECONDS + seconds}
              aria-valuetext={`${shown.title}, ${clock(seconds)} of ${clock(PREVIEW_SECONDS)}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative h-12 cursor-ew-resize touch-none select-none"
            >
              {Array.from({ length: TICKS }, (_, i) => (
                <Tick key={i} at={i / (TICKS - 1)} progress={progress} still={reduced} />
              ))}
              {/* Where each track begins. */}
              {tracks.slice(1).map((track, i) => (
                <Tick
                  key={track.position}
                  at={(i + 1) / count}
                  progress={progress}
                  still={reduced}
                  major
                />
              ))}
              <Cursor progress={progress} />
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-baseline gap-4 text-xs">
              <span className="truncate text-ink-soft">{first?.title}</span>
              <span className="numerals text-ink">
                {clock(seconds)} <span className="text-ink-soft">/ {clock(PREVIEW_SECONDS)}</span>
              </span>
              <span className="truncate text-right text-ink-soft">{last?.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => {
                step(-1);
              }}
              disabled={index === 0}
              aria-label="Previous track"
              className="grid size-10 place-items-center rounded-full text-ink disabled:opacity-30"
            >
              <SkipBack aria-hidden="true" className="size-5 fill-current" />
            </button>
            <motion.button
              type="button"
              onClick={toggle}
              aria-label={playing ? 'Pause' : 'Play'}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              transition={press}
              className="grid size-14 place-items-center rounded-full bg-sticker text-sticker-ink shadow-photo"
            >
              {playing ? (
                <Pause aria-hidden="true" className="size-6 fill-current" />
              ) : (
                <Play aria-hidden="true" className="ml-0.5 size-6 fill-current" />
              )}
            </motion.button>
            <button
              type="button"
              onClick={() => {
                step(1);
              }}
              disabled={index === count - 1}
              aria-label="Next track"
              className="grid size-10 place-items-center rounded-full text-ink disabled:opacity-30"
            >
              <SkipForward aria-hidden="true" className="size-5 fill-current" />
            </button>
          </div>
        </div>

        {/* The liner notes: what is on the platter, and what is playing. */}
        <aside className="flex flex-col">
          <h2 className="text-[clamp(1.75rem,3.2vw,2.75rem)] font-bold leading-[1.02] tracking-[-0.02em] [text-wrap:balance]">
            {release.title}
          </h2>
          <dl className="mt-5">
            <Note label="Artist">
              {release.artists.map((artist) => (
                <span key={artist} className="block">
                  {artist}
                </span>
              ))}
            </Note>
            {release.year != null && (
              <Note label="Year">
                <span className="numerals">{release.year}</span>
              </Note>
            )}
            {release.label && (
              <Note label="Label">
                {release.label}
                {release.catalogNumber && (
                  <span className="block text-ink-soft">{release.catalogNumber}</span>
                )}
              </Note>
            )}
          </dl>
          <div className="border-t border-ink/70 pt-2">
            <h3 className="condensed text-[0.7rem] text-ink-soft">Tracks</h3>
            <ol className="mt-1">
              {release.tracklist.map((track) => {
                const playable = playableAt.get(track.position);
                const isShown = track.position === shown.position;
                return (
                  <li key={`${track.position}-${track.title}`}>
                    <button
                      type="button"
                      disabled={playable === undefined}
                      aria-current={isShown ? 'true' : undefined}
                      onClick={() => {
                        if (playable !== undefined) playTrack(playable);
                      }}
                      className={`relative flex w-full items-baseline gap-3 py-1 text-left text-sm ${
                        isShown ? 'text-ink' : 'text-ink-soft enabled:hover:text-ink'
                      }`}
                    >
                      {isShown && (
                        <motion.span
                          layoutId="playing-dot"
                          aria-hidden="true"
                          transition={reduced ? { duration: 0 } : trackSlide}
                          className="absolute -left-3 top-1/2 -mt-0.5 size-1 rounded-full bg-ink"
                        />
                      )}
                      <span className="condensed numerals w-6 shrink-0 text-[0.7rem]">
                        {track.position}
                      </span>
                      <span className="flex-1 text-right">{track.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <footer className="mt-6 flex flex-col items-start gap-3 border-t border-rule pt-4 text-xs text-ink-soft">
            <p>{previews.attribution}</p>
            {/* The room covers the page footer, so it carries the Discogs credit itself. */}
            <DiscogsCredit href={release.discogsUrl} />
            {previews.albumUrl && (
              <a href={previews.albumUrl} target="_blank" rel="noreferrer">
                <img src={appleMusicBadge} alt="Listen on Apple Music" className="h-10 w-auto" />
              </a>
            )}
          </footer>
        </aside>
      </div>

      {/* Streamed from Apple, never stored (ADR 0010 §4). */}
      <audio
        ref={audio}
        src={current.previewUrl}
        preload="auto"
        onPlay={() => {
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
        }}
        onEnded={() => {
          if (index < count - 1) {
            keepPlaying.current = true;
            setIndex(index + 1);
          }
        }}
        onError={() => {
          // A preview that will not load is skipped, never left as a silent player.
          if (index < count - 1) setIndex(index + 1);
        }}
      />
    </div>,
    document.body,
  );
}

/**
 * One mark on the ruler. Marks near the cursor rise like a magnified scale, scaled
 * from their foot (transform only).
 */
function Tick({
  at,
  progress,
  still,
  major = false,
}: {
  at: number;
  progress: MotionValue<number>;
  still: boolean;
  major?: boolean;
}) {
  const scaleY = useTransform(progress, (p) => {
    if (still) return 1;
    const near = Math.max(0, 1 - Math.abs(p - at) / REACH);
    return 1 + RISE * near * near;
  });
  return (
    <motion.span
      aria-hidden="true"
      className={`absolute bottom-0 w-px origin-bottom ${major ? 'h-5 bg-ink/60' : 'h-3 bg-ink/30'}`}
      style={{ left: `${String(at * 100)}%`, scaleY }}
    />
  );
}

/** The tall ink mark that is "now": a full-width layer slid along, so only transform moves. */
function Cursor({ progress }: { progress: MotionValue<number> }) {
  const x = useTransform(progress, (p) => `${String(p * 100)}%`);
  return (
    <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ x }}>
      <span className="absolute bottom-0 left-0 h-12 w-0.5 -translate-x-1/2 rounded-full bg-ink" />
    </motion.span>
  );
}

/** One line of the liner notes: a small-caps label, its value set right, a hairline above. */
function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-ink/70 py-2">
      <dt className="condensed text-[0.7rem] text-ink-soft">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

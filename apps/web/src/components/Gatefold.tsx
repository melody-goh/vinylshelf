import type { CollectionItem, Release, ReleasePreviews } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Play, Star } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ApiError } from '../api/client';
import { useExpired } from '../api/expiry';
import { useDwell, usePreviews } from '../api/previews';
import { useRelease } from '../api/releases';
import { LOGIN_URL } from '../api/session';
import { useBoardInk, type BoardInk } from '../design/board';
import { useWideScreen } from '../design/media';
import { discSurface } from '../design/vinyl';
import { ListeningRoom, playableTracks } from './ListeningRoom';
import { MissingCover } from './MissingCover';

const fold = { type: 'spring', stiffness: 210, damping: 29 } as const;

const ADDED = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * The open gatefold: one record at full size. The cover on the left panel; on the right,
 * its liner notes printed on a board in the cover's own ink. Choosing another record
 * folds the board shut on its crease over the cover, swaps the record while it is
 * closed, and opens it again. Under reduced motion the record crossfades instead.
 */
export function Gatefold({ item }: { item: CollectionItem }) {
  const wide = useWideScreen();
  const reduced = useReducedMotion() ?? false;
  // The board hinges on the fold: its left edge beside the cover, its top edge below it.
  const board: Variants = reduced
    ? {}
    : wide
      ? { open: { rotateY: 0 }, closed: { rotateY: -180 } }
      : { open: { rotateX: 0 }, closed: { rotateX: 180 } };
  const sleeve: Variants = reduced
    ? { open: { opacity: 1 }, closed: { opacity: 0 } }
    : { open: { opacity: 1 }, closed: { opacity: 1, transition: { when: 'afterChildren' } } };

  // Previews are looked up for a record someone stays with, not every one flicked past.
  const detail = useRelease(item.release.discogsId).data;
  const previewsQuery = usePreviews(item.release.discogsId, useDwell(item.instanceId));
  const [listening, setListening] = useState<{
    instanceId: number;
    position: string;
    from: DOMRect | null;
  } | null>(null);
  /** The cover panel: the sleeve the Listening Room draws the disc out of. */
  const cover = useRef<HTMLDivElement>(null);
  const listen: Listen = {
    previews: previewsQuery.data,
    failed: previewsQuery.isError,
    onPlay: (position) => {
      setListening({
        instanceId: item.instanceId,
        position,
        from: cover.current?.getBoundingClientRect() ?? null,
      });
    },
    onRetry: () => {
      void previewsQuery.refetch();
    },
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <AnimatePresence mode="wait" initial={false}>
        <motion.article
          key={item.instanceId}
          aria-labelledby={`record-${String(item.instanceId)}`}
          variants={sleeve}
          initial="closed"
          animate="open"
          exit="closed"
          transition={fold}
          className="grid w-full shadow-photo [perspective:2400px] md:grid-cols-2"
        >
          <OpenGatefold item={item} board={board} listen={listen} coverRef={cover} />
        </motion.article>
      </AnimatePresence>
      {listening?.instanceId === item.instanceId && detail && previewsQuery.data && (
        <ListeningRoom
          release={detail}
          previews={previewsQuery.data}
          startAt={listening.position}
          from={listening.from}
          onClose={() => {
            setListening(null);
          }}
        />
      )}
      <Community discogsId={item.release.discogsId} discogsUrl={item.release.discogsUrl} />
    </div>
  );
}

const COUNT = new Intl.NumberFormat();

/**
 * What the Discogs community says about the open record: its rating and how many own
 * and want it. Set as plain text on the ground under the sleeve, outside it, since it
 * is about the record's standing rather than its liner notes. "Discogs" links to the
 * release there: the attribution this data needs (ADR 0004).
 */
function Community({ discogsId, discogsUrl }: { discogsId: number; discogsUrl: string }) {
  const { data } = useRelease(discogsId);
  if (!data) return <p aria-hidden="true" className="min-h-5" />;
  const { rating, have, want } = data.community;

  return (
    <p className="numerals flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
      {rating.count > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-ink">
          <Star aria-hidden="true" className="size-3.5 fill-current" />
          <span>
            <span className="font-semibold">{rating.average.toFixed(2)}</span>
            <span className="text-ink-soft">
              {' '}
              from {COUNT.format(rating.count)} {rating.count === 1 ? 'rating' : 'ratings'}
            </span>
          </span>
        </span>
      ) : (
        <span>No ratings yet</span>
      )}
      <span aria-hidden="true">·</span>
      <span>{COUNT.format(have)} have it</span>
      <span aria-hidden="true">·</span>
      <span>{COUNT.format(want)} want it</span>
      <span aria-hidden="true">·</span>
      <span>
        on{' '}
        <a href={discogsUrl} className="underline">
          Discogs
        </a>
      </span>
    </p>
  );
}

/** What the liner notes need to offer previews (ADR 0010). */
interface Listen {
  previews: ReleasePreviews | undefined;
  failed: boolean;
  onPlay: (position: string) => void;
  onRetry: () => void;
}

function OpenGatefold({
  item,
  board: hinge,
  listen,
  coverRef,
}: {
  item: CollectionItem;
  board: Variants;
  listen: Listen;
  coverRef: RefObject<HTMLDivElement | null>;
}) {
  const { release } = item;
  const board = useBoardInk(release.coverImageUrl ?? null);
  const queryClient = useQueryClient();
  const detailQuery = useRelease(release.discogsId);
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['release', release.discogsId] });
  }, [queryClient, release.discogsId]);
  const expired = useExpired(detailQuery.data?.expiresAt, refetch);
  const detail = expired ? undefined : detailQuery.data;

  return (
    <>
      <div ref={coverRef} className="relative aspect-square bg-carbon">
        {release.coverImageUrl ? (
          <img
            src={release.coverImageUrl}
            alt={`Cover of ${release.title}`}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <MissingCover title={release.title} artists={release.artists} />
        )}
      </div>

      <motion.div
        variants={hinge}
        transition={fold}
        className="relative z-10 flex min-h-0 origin-top flex-col [transform-style:preserve-3d] md:aspect-square md:origin-left"
        style={{ backgroundColor: board.ink, color: board.text }}
      >
        {/* The fold: a soft crease where the board meets the cover panel. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-6 bg-gradient-to-r from-black/30 to-transparent md:block"
        />
        {/* Title and attribution stay put; only the liner notes between them scroll. */}
        {/* The printed side faces away once the board is folded shut; its back is plain ink. */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 p-6 [backface-visibility:hidden] md:p-8 lg:p-10">
          <header>
            <h2
              id={`record-${String(item.instanceId)}`}
              className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold leading-[0.95] tracking-[-0.02em] [font-stretch:78%] [text-wrap:balance]"
            >
              {release.title}
            </h2>
            <p className="mt-2 text-base">{release.artists.join(', ')}</p>
            <p className="numerals mt-1 text-sm" style={{ color: board.soft }}>
              {/* Only a colourway Discogs names is printed; black is drawn, not claimed. */}
              {[release.year ?? 'Year unknown', discSurface(release.vinylColors).description]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </header>

          <NotesScroller board={board}>
            <LinerNotes detail={detail} error={detailQuery.error} board={board} listen={listen} />
          </NotesScroller>

          <footer className="space-y-2">
            <p className="condensed numerals text-[0.7rem]" style={{ color: board.soft }}>
              {[
                detail?.catalogNumber,
                detail?.label,
                `Added ${ADDED.format(new Date(item.dateAdded))}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </footer>
        </div>
      </motion.div>
    </>
  );
}

/**
 * The liner notes fit the board for a typical record. A long box set's notes scroll
 * within it, and then say so: the fade and the cue appear only while more is below.
 */
function NotesScroller({ board, children }: { board: BoardInk; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      setMoreBelow(element.scrollHeight - element.scrollTop - element.clientHeight > 4);
    };
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        // Focusable only when it scrolls, so keyboard users can read the rest.
        tabIndex={moreBelow ? 0 : undefined}
        role={moreBelow ? 'region' : undefined}
        aria-label={moreBelow ? 'Liner notes' : undefined}
        className={`-mr-3 min-h-0 flex-1 overflow-y-auto pr-3 ${moreBelow ? '[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]' : ''}`}
      >
        {children}
      </div>
      {moreBelow && (
        <p
          aria-hidden="true"
          className="condensed pointer-events-none absolute bottom-0 right-0 flex items-center gap-1 text-[0.7rem]"
          style={{ color: board.soft }}
        >
          More below <ChevronDown className="size-3.5" />
        </p>
      )}
    </div>
  );
}

function LinerNotes({
  detail,
  error,
  board,
  listen,
}: {
  detail: Release | undefined;
  error: Error | null;
  board: BoardInk;
  listen: Listen;
}) {
  if (error) {
    const code = error instanceof ApiError ? error.problem?.code : undefined;
    return (
      <p role="alert" className="text-sm leading-relaxed">
        {code === 'discogs_auth_revoked' ? (
          <>
            Discogs access was revoked, so the liner notes can&rsquo;t load.{' '}
            <a href={LOGIN_URL} className="underline">
              Sign in again
            </a>
            .
          </>
        ) : (
          'Discogs isn’t answering, so the liner notes can’t load right now. Try this record again in a minute.'
        )}
      </p>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-2">
        <p role="status" className="text-sm" style={{ color: board.soft }}>
          Reading the liner notes…
        </p>
        <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
          {[72, 58, 66, 49].map((w) => (
            <div
              key={w}
              className="h-3 rounded-sm bg-current opacity-15"
              style={{ width: `${String(w)}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const playable = listen.previews ? playableTracks(detail, listen.previews) : [];
  const canPlay = new Set(playable.map((t) => t.position));

  return (
    <div className="grid gap-6 text-sm lg:grid-cols-2 lg:gap-8 lg:text-[0.8125rem]">
      {detail.tracklist.length > 0 && (
        <section aria-label="Tracklist">
          <ListenLine listen={listen} first={playable[0]?.position} board={board} />
          <ol className="divide-y lg:-mt-1.5">
            {detail.tracklist.map((track) => (
              <li
                key={`${track.position}-${track.title}`}
                className="numerals grid grid-cols-[2.5rem_1fr_auto_1.25rem] items-center gap-3 py-1.5"
                style={{ borderColor: 'color-mix(in srgb, currentColor 22%, transparent)' }}
              >
                <span className="condensed text-[0.7rem] leading-5" style={{ color: board.soft }}>
                  {track.position}
                </span>
                <span>{track.title}</span>
                <span style={{ color: board.soft }}>{track.duration ?? ''}</span>
                {canPlay.has(track.position) ? (
                  <button
                    type="button"
                    onClick={() => {
                      listen.onPlay(track.position);
                    }}
                    aria-label={`Play a preview of ${track.title}`}
                    className="grid size-5 place-items-center rounded-full opacity-70 hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Play aria-hidden="true" className="size-3 fill-current" />
                  </button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <dl className="grid content-start grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {detail.formats.length > 0 && (
          <Fact term="Format" value={detail.formats.join(' / ')} board={board} />
        )}
        {detail.genres.length > 0 && (
          <Fact
            term="Genre"
            value={[...detail.genres, ...detail.styles].join(', ')}
            board={board}
          />
        )}
        {detail.credits.map((credit) => (
          <Fact
            key={`${credit.role}-${credit.name}`}
            term={credit.role}
            value={credit.name}
            board={board}
          />
        ))}
      </dl>
    </div>
  );
}

/**
 * The tracklist's first line once previews are known: an invitation to listen, or a
 * plain word that this record has none. Nothing is shown while they are looked up.
 */
function ListenLine({
  listen,
  first,
  board,
}: {
  listen: Listen;
  first: string | undefined;
  board: BoardInk;
}) {
  if (listen.failed) {
    return (
      <p className="mb-2 text-xs" style={{ color: board.soft }}>
        Previews are unavailable right now.{' '}
        <button type="button" onClick={listen.onRetry} className="underline">
          Try again
        </button>
      </p>
    );
  }
  if (!listen.previews) return null;
  if (first === undefined) {
    return (
      <p className="mb-2 text-xs" style={{ color: board.soft }}>
        No previews for this record
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        listen.onPlay(first);
      }}
      className="mb-2 inline-flex items-center gap-2 text-sm font-semibold"
    >
      <span className="grid size-6 place-items-center rounded-full bg-current">
        <Play
          aria-hidden="true"
          className="ml-px size-3 fill-current"
          style={{ color: board.ink }}
        />
      </span>
      Listen to previews
    </button>
  );
}

function Fact({ term, value, board }: { term: string; value: string; board: BoardInk }) {
  return (
    <>
      <dt className="condensed pt-0.5 text-[0.7rem]" style={{ color: board.soft }}>
        {term}
      </dt>
      <dd>{value}</dd>
    </>
  );
}

import type { CollectionItem, Release } from '@vinylshelf/contract';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback } from 'react';
import { ApiError } from '../api/client';
import { useExpired } from '../api/expiry';
import { useRelease } from '../api/releases';
import { LOGIN_URL } from '../api/session';
import { useBoardInk, type BoardInk } from '../design/board';
import { discSurface } from '../design/vinyl';
import { DiscogsCredit } from './DiscogsCredit';

const unfold = { type: 'spring', stiffness: 260, damping: 30 } as const;

const ADDED = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * The open gatefold: one record at full size. The cover on the left panel; on the right,
 * its liner notes printed on a board in the cover's own ink. Choosing another record
 * folds this one away and unfolds the next.
 */
export function Gatefold({ item }: { item: CollectionItem }) {
  return (
    <div className="w-full [perspective:1600px]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.article
          key={item.instanceId}
          aria-labelledby={`record-${String(item.instanceId)}`}
          initial={{ opacity: 0, rotateY: -14, x: 28 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          exit={{ opacity: 0, rotateY: 14, x: -28 }}
          transition={unfold}
          className="grid origin-center shadow-photo md:grid-cols-2"
        >
          <OpenGatefold item={item} />
        </motion.article>
      </AnimatePresence>
    </div>
  );
}

function OpenGatefold({ item }: { item: CollectionItem }) {
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
      <div className="relative aspect-square bg-carbon">
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

      <div
        className="relative flex min-h-0 flex-col md:aspect-square"
        style={{ backgroundColor: board.ink, color: board.text }}
      >
        {/* The fold: a soft crease where the board meets the cover panel. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-6 bg-gradient-to-r from-black/30 to-transparent md:block"
        />
        {/* Title and attribution stay put; only the liner notes between them scroll. */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 p-6 md:p-8 lg:p-10">
          <header>
            <h2
              id={`record-${String(item.instanceId)}`}
              className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold leading-[0.95] tracking-[-0.02em] [font-stretch:78%] [text-wrap:balance]"
            >
              {release.title}
            </h2>
            <p className="mt-2 text-base">{release.artists.join(', ')}</p>
            <p className="numerals mt-1 text-sm" style={{ color: board.soft }}>
              {[release.year ?? 'Year unknown', discSurface(release.vinylColors).description]
                .join(' · ')
                .replace(/^./, (c) => c.toUpperCase())}
            </p>
          </header>

          <div className="-mr-3 min-h-0 flex-1 overflow-y-auto pb-4 pr-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]">
            <LinerNotes detail={detail} error={detailQuery.error} board={board} />
          </div>

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
            <DiscogsCredit href={release.discogsUrl} className="" />
          </footer>
        </div>
      </div>
    </>
  );
}

function LinerNotes({
  detail,
  error,
  board,
}: {
  detail: Release | undefined;
  error: Error | null;
  board: BoardInk;
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

  return (
    <div className="space-y-6 text-sm">
      {detail.tracklist.length > 0 && (
        <section aria-label="Tracklist">
          <ol className="divide-y">
            {detail.tracklist.map((track) => (
              <li
                key={`${track.position}-${track.title}`}
                className="numerals grid grid-cols-[2.5rem_1fr_auto] gap-3 py-1.5"
                style={{ borderColor: 'color-mix(in srgb, currentColor 22%, transparent)' }}
              >
                <span className="condensed text-[0.7rem] leading-5" style={{ color: board.soft }}>
                  {track.position}
                </span>
                <span>{track.title}</span>
                <span style={{ color: board.soft }}>{track.duration ?? ''}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
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

/** When Discogs has no cover: the sleeve printed with its own title, never a stock image. */
function MissingCover({ title, artists }: { title: string; artists: string[] }) {
  return (
    <div className="flex h-full flex-col justify-end p-8 text-ground">
      <p className="condensed text-[clamp(2rem,4vw,3.5rem)] font-extrabold leading-[0.9] [font-stretch:62%]">
        {title}
      </p>
      <p className="mt-2 text-sm text-ground/75">{artists.join(', ')}</p>
    </div>
  );
}

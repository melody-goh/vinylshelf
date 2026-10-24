import type { CollectionItem, SearchResult } from '@vinylshelf/contract';
import { motion } from 'motion/react';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { LOGIN_URL } from '../api/session';
import { MIN_QUERY, useAddToShelf, useDebounced, useSearch } from '../api/search';
import { DiscogsCredit } from './DiscogsCredit';

const press = { type: 'spring', stiffness: 500, damping: 28 } as const;

/**
 * Discogs search, in the gatefold's place while the user is looking for a record to
 * add. Each result names the pressing (year, country, label, catalogue number,
 * formats) so the right one can be told apart, and adds with one press (ADR 0009).
 */
export function SearchResults({
  query,
  onAdded,
}: {
  query: string;
  onAdded: (item: CollectionItem) => void;
}) {
  const settled = useDebounced(query.trim());
  const [page, setPage] = useState({ query: settled, number: 1 });
  // A new query starts again from its first page.
  const pageNumber = page.query === settled ? page.number : 1;
  const search = useSearch(settled, pageNumber);
  const goTo = (number: number) => {
    setPage({ query: settled, number });
  };

  if (settled.length < MIN_QUERY) {
    return (
      <p className="text-sm text-ink-soft">
        Type at least two letters: a title, an artist, a catalogue number or a barcode.
      </p>
    );
  }

  if (search.isError) {
    const code = search.error instanceof ApiError ? search.error.problem?.code : undefined;
    return (
      <p role="alert" className="text-sm leading-relaxed">
        {code === 'discogs_auth_revoked' ? (
          <>
            Discogs access was revoked, so search can&rsquo;t run.{' '}
            <a href={LOGIN_URL} className="underline">
              Sign in again
            </a>
            .
          </>
        ) : search.error instanceof ApiError && search.error.status === 429 ? (
          'That was a lot of searching. Give it a minute, then try again.'
        ) : (
          'Discogs isn’t answering, so search can’t run right now. Try again in a minute.'
        )}
      </p>
    );
  }

  if (!search.data) {
    return (
      <p role="status" className="text-sm text-ink-soft">
        Looking through Discogs…
      </p>
    );
  }

  const { results, pages, totalResults } = search.data;
  return (
    <section aria-label="Search results" className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p role="status" className="numerals text-sm text-ink-soft">
          {totalResults === 0
            ? `No vinyl on Discogs matches “${settled}”.`
            : `${totalResults.toLocaleString()} vinyl ${totalResults === 1 ? 'release' : 'releases'} on Discogs`}
          {search.isFetching ? ' · searching…' : ''}
        </p>
        <DiscogsCredit href="https://www.discogs.com" />
      </div>

      {results.length > 0 && (
        <ol className="divide-y divide-rule border-y border-rule">
          {results.map((result) => (
            <ResultRow key={result.discogsId} result={result} onAdded={onAdded} />
          ))}
        </ol>
      )}

      {pages > 1 && (
        <nav aria-label="Search pages" className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => {
              goTo(pageNumber - 1);
            }}
            className="underline disabled:no-underline disabled:opacity-40"
          >
            Previous
          </button>
          <span className="numerals text-ink-soft">
            Page {pageNumber} of {pages}
          </span>
          <button
            type="button"
            disabled={pageNumber >= pages}
            onClick={() => {
              goTo(pageNumber + 1);
            }}
            className="underline disabled:no-underline disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

function ResultRow({
  result,
  onAdded,
}: {
  result: SearchResult;
  onAdded: (item: CollectionItem) => void;
}) {
  const add = useAddToShelf();
  // A release already on the shelf needs a second, explicit yes (ADR 0009 §3).
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const code = add.error instanceof ApiError ? add.error.problem?.code : undefined;
  const onShelf = result.inCollection || code === 'already_in_collection';

  const submit = (allowDuplicate: boolean) => {
    add.mutate({ discogsId: result.discogsId, allowDuplicate }, { onSuccess: onAdded });
  };

  const pressing = [
    result.year ?? 'Year unknown',
    result.country,
    [result.label, result.catalogNumber].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-4 py-3 md:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
      <div className="aspect-square overflow-hidden bg-carbon shadow-photo">
        {result.thumbUrl && (
          <img
            src={result.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate font-semibold leading-tight">{result.title}</p>
        <p className="truncate text-sm">{result.artists.join(', ')}</p>
        <p className="condensed numerals mt-1 truncate text-[0.7rem] text-ink-soft">{pressing}</p>
        {result.formats.length > 0 && (
          <p className="truncate text-xs text-ink-soft">{result.formats.join(', ')}</p>
        )}
        {add.isError && code !== 'already_in_collection' && (
          <p role="alert" className="mt-1 text-xs">
            {code === 'discogs_auth_revoked' ? (
              <>
                Discogs access was revoked.{' '}
                <a href={LOGIN_URL} className="underline">
                  Sign in again
                </a>
              </>
            ) : (
              'Couldn’t add it to Discogs just now. Nothing changed; try again in a minute.'
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 text-right">
        {onShelf && !confirmingCopy ? (
          <>
            <span className="condensed text-[0.7rem] text-ink-soft">On your shelf</span>
            <button
              type="button"
              onClick={() => {
                setConfirmingCopy(true);
              }}
              className="text-xs underline"
              aria-label={`I have another copy of ${result.title}`}
            >
              I have another copy
            </button>
          </>
        ) : (
          <motion.button
            type="button"
            onClick={() => {
              submit(onShelf);
            }}
            disabled={add.isPending}
            aria-label={
              onShelf ? `Add another copy of ${result.title}` : `Add ${result.title} to your shelf`
            }
            initial={{ rotate: -8 }}
            whileHover={add.isPending ? {} : { scale: 1.06, rotate: -4 }}
            whileTap={add.isPending ? {} : { scale: 0.96 }}
            transition={press}
            className="condensed grid size-14 place-items-center rounded-full bg-sticker text-center text-[0.7rem] font-bold leading-none text-sticker-ink shadow-photo disabled:opacity-70 md:size-16"
          >
            {add.isPending ? 'Adding' : onShelf ? 'Add copy' : 'Add'}
          </motion.button>
        )}
      </div>
    </li>
  );
}

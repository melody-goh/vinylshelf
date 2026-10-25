import type { CollectionItem, WantlistItem } from '@vinylshelf/contract';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { useAddToShelf } from '../api/search';
import { useWant, useWantlist } from '../api/wantlist';
import { useWideScreen } from '../design/media';
import { CoverGrid } from './CoverGrid';
import { Readout } from './Readout';

const PLACEHOLDERS = 24;

/**
 * The records the user is looking for (ADR 0011), as a contact sheet of covers like the
 * library. Choosing a cover puts it in the strip at the foot with what can be done: it
 * was acquired (onto the shelf, off the wantlist), or it is no longer wanted.
 */
export function Wantlist({ onAcquired }: { onAcquired: (item: CollectionItem | null) => void }) {
  const wide = useWideScreen();
  const reduced = useReducedMotion() ?? false;
  const wantlist = useWantlist();
  const { remove } = useWant();
  const addToShelf = useAddToShelf();
  const [leaning, setLeaning] = useState<WantlistItem | null>(null);
  const [chosen, setChosen] = useState<WantlistItem | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setEntering(false);
    }, 1500);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = wantlist;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scroller.current, rootMargin: '600px' },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = (wantlist.data?.pages ?? []).flatMap((p) => p.items);
  const busy = addToShelf.isPending || remove.isPending;

  const choose = (item: WantlistItem) => {
    setFailed(null);
    setChosen((current) => (current?.release.discogsId === item.release.discogsId ? null : item));
  };

  // Acquired: onto the shelf first, then off the wantlist (ADR 0011). Already on the
  // shelf is fine; it simply leaves the wantlist.
  const acquired = async (item: WantlistItem) => {
    setFailed(null);
    const id = item.release.discogsId;
    let added: CollectionItem | null = null;
    try {
      added = await addToShelf.mutateAsync({ discogsId: id });
    } catch (error) {
      const code = error instanceof ApiError ? error.problem?.code : undefined;
      if (code !== 'already_in_collection') {
        setFailed('Couldn’t add it to Discogs just now. Nothing changed.');
        return;
      }
    }
    try {
      await remove.mutateAsync(id);
    } catch {
      setFailed('It’s on your shelf, but couldn’t be taken off the wantlist. Try Remove.');
      return;
    }
    setChosen(null);
    onAcquired(added);
  };

  const unwant = async (item: WantlistItem) => {
    setFailed(null);
    try {
      await remove.mutateAsync(item.release.discogsId);
      setChosen(null);
    } catch {
      setFailed('Couldn’t reach Discogs just now. Nothing changed.');
    }
  };

  const named = chosen ?? leaning;

  return (
    <section aria-label="Wantlist" className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {wantlist.isPending ? (
          <ul
            aria-hidden="true"
            className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] md:gap-4"
          >
            {Array.from({ length: PLACEHOLDERS }, (_, i) => (
              <li key={i} className="aspect-square bg-rule/50" />
            ))}
          </ul>
        ) : wantlist.isError ? (
          <p role="alert" className="text-sm">
            Discogs isn&rsquo;t answering, so your wantlist can&rsquo;t load right now.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing on your wantlist yet.</p>
        ) : (
          <CoverGrid
            items={items}
            keyOf={(item) => item.release.discogsId}
            onChoose={choose}
            onLean={setLeaning}
            scatter={!reduced && entering}
            selectedKey={chosen?.release.discogsId ?? null}
          />
        )}
        <div ref={sentinel} className="h-px" />
      </div>

      <Readout
        leaning={named}
        wide={wide}
        hint="Choose a record"
        actions={
          chosen && (
            <>
              {failed && (
                <span role="alert" className="text-xs text-ink-soft">
                  {failed}
                </span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void acquired(chosen);
                }}
                className="font-semibold underline disabled:opacity-50"
              >
                {addToShelf.isPending ? 'Adding…' : 'Acquired'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void unwant(chosen);
                }}
                className="text-ink-soft underline disabled:opacity-50"
              >
                Remove
              </button>
            </>
          )
        }
      />
    </section>
  );
}

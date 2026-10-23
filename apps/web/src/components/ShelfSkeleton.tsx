/** At most this many placeholder rows, however many records are being refreshed. */
const MAX_ROWS = 8;

/**
 * Stand-ins for records whose Discogs data expired and is being re-fetched (ADR 0004
 * §4). Shown instead of an empty list, so an expired shelf reads as "loading", not
 * "you own nothing". The pulse only runs when the user allows motion.
 */
export function ShelfSkeleton({ count }: { count: number }) {
  return (
    <div>
      <p role="status" className="text-sm text-neutral-600">
        Refreshing {count} {count === 1 ? 'record' : 'records'} from Discogs…
      </p>
      <ul aria-hidden="true" className="mt-3 space-y-3">
        {Array.from({ length: Math.min(count, MAX_ROWS) }, (_, i) => (
          <li key={i} className="flex gap-4 motion-safe:animate-pulse">
            <div className="h-16 w-16 rounded bg-neutral-200" />
            <div className="flex-1 space-y-2 py-2">
              <div className="h-4 w-2/3 rounded bg-neutral-200" />
              <div className="h-3 w-1/3 rounded bg-neutral-200" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

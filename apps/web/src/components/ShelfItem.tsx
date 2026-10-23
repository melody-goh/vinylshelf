import type { CollectionItem } from '@vinylshelf/contract';
import { DiscogsCredit } from './DiscogsCredit';

export function ShelfItem({ item }: { item: CollectionItem }) {
  const { release } = item;
  return (
    <li className="flex gap-4">
      {release.coverImageUrl ? (
        // Hotlinked from Discogs and never stored (ADR 0004 §6).
        <img
          src={release.coverImageUrl}
          alt={`Cover of ${release.title}`}
          width={64}
          height={64}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-16 w-16 rounded object-cover"
        />
      ) : (
        <div className="h-16 w-16 rounded bg-neutral-100" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{release.title}</p>
        <p className="text-sm text-neutral-700">
          {release.artists.join(', ')} · {release.year ?? 'Unknown year'}
        </p>
        <DiscogsCredit href={release.discogsUrl} />
      </div>
    </li>
  );
}

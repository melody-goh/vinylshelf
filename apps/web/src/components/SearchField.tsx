import { Search, X } from 'lucide-react';

/**
 * The header's search field: text set straight on the ground over a hairline, like the
 * rest of the header, not a boxed control. Escape clears it and returns to the shelf.
 */
export function SearchField({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`relative flex items-center gap-2 border-b border-ink/25 pb-1 ${className}`}>
      <Search aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
      <span className="sr-only">Search Discogs for a record</span>
      <input
        type="search"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
        }}
        placeholder="Find a record on Discogs"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-ink-soft focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
          }}
          className="grid size-6 place-items-center rounded-full text-ink-soft hover:text-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </label>
  );
}

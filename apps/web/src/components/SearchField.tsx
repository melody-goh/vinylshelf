import { Search, X } from 'lucide-react';

/**
 * A search field: text set straight on the ground over a hairline, like the rest of the
 * header, not a boxed control. Escape clears it. The header searches Discogs as you
 * type; Discover searches by description when Enter is pressed.
 */
export function SearchField({
  value,
  onChange,
  onEnter,
  label = 'Search Discogs for a record',
  placeholder = 'Find a record on Discogs',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`relative flex items-center gap-2 border-b border-ink/25 pb-1 ${className}`}>
      <Search aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
          if (e.key === 'Enter') onEnter?.();
        }}
        placeholder={placeholder}
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

import { ChevronDown } from 'lucide-react';

export interface TextOption<T extends string> {
  value: T;
  label: string;
  /** Shown in the menu after the label ("Jazz (12)"), not once chosen. */
  count?: number;
}

/**
 * A menu set as text on the ground: a Soft Ink label, the chosen value in Ink and a
 * chevron. A native select lies invisibly over it, so keyboards, screen readers and
 * phones get the real control, while the text is only as wide as what it says.
 */
export function TextSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly TextOption<T>[];
  onChange: (value: T) => void;
}) {
  const chosen = options.find((o) => o.value === value)?.label ?? value;
  return (
    <div className="relative flex shrink-0 cursor-pointer items-center gap-2 rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-sticker">
      <span aria-hidden="true" className="text-ink-soft">
        {label}
      </span>
      <span aria-hidden="true" className="font-medium">
        {chosen}
      </span>
      <ChevronDown aria-hidden="true" className="size-4" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value as T);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count === undefined
              ? option.label
              : `${option.label} (${String(option.count)})`}
          </option>
        ))}
      </select>
    </div>
  );
}

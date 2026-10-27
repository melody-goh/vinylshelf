import { motion, useReducedMotion } from 'motion/react';

/** The tabs' spring, so a choice moves like the header's tabs do. */
const slide = { type: 'spring', stiffness: 420, damping: 34 } as const;

/**
 * A choice between a few words, set like the view tabs: the chosen one in ink with a
 * dot under it that travels between them, the others in soft ink. A radio group, so
 * assistive tech hears one choice among several.
 */
export function DotChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  dotId,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Unique per choice on screen, so each dot travels only within its own group. */
  dotId: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="text-ink-soft" id={`${dotId}-label`}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${dotId}-label`} className="flex gap-3">
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => {
                onChange(option.value);
              }}
              className={`relative pb-1.5 ${chosen ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
            >
              {option.label}
              {chosen && (
                <motion.span
                  layoutId={dotId}
                  aria-hidden="true"
                  transition={reduce ? { duration: 0 } : slide}
                  className="absolute inset-x-0 bottom-0 mx-auto size-1 rounded-full bg-ink"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

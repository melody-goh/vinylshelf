import { motion, useReducedMotion } from 'motion/react';

/** The disc stack's lean spring, so every move in the header shares one weight. */
const slide = { type: 'spring', stiffness: 420, damping: 34 } as const;

export interface ViewTabsProps<V extends string> {
  views: readonly V[];
  names: Record<V, string>;
  current: V;
  onChange: (view: V) => void;
}

/**
 * The view switcher: the current view in ink with a single dot under it, the others in
 * soft ink. There is one dot, not one per tab: it travels to the chosen view on a
 * spring, so switching reads as one object moving rather than two states swapping.
 */
export function ViewTabs<V extends string>({ views, names, current, onChange }: ViewTabsProps<V>) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label="Views" className="flex gap-5 text-sm">
      {views.map((view) => (
        <button
          key={view}
          type="button"
          aria-current={view === current ? 'page' : undefined}
          onClick={() => {
            onChange(view);
          }}
          className={`relative pb-1.5 ${view === current ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
        >
          {names[view]}
          {view === current && (
            <motion.span
              layoutId="view-dot"
              aria-hidden="true"
              transition={reduce ? { duration: 0 } : slide}
              className="absolute inset-x-0 bottom-0 mx-auto size-1 rounded-full bg-ink"
            />
          )}
        </button>
      ))}
    </nav>
  );
}

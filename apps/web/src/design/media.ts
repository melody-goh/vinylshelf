import { useSyncExternalStore } from 'react';

/** Matches Tailwind's `md` breakpoint, where the stack stands beside the gatefold. */
const WIDE = '(min-width: 48rem)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

/** Whether the screen is wide enough for the side-by-side layout. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches,
    () => true,
  );
}

import type { CollectionItem } from '@vinylshelf/contract';
import { motion } from 'motion/react';

/** A slow, never-ending drift: a spring with no bounce, mirrored back and forth. */
const drift = {
  type: 'spring',
  visualDuration: 12,
  bounce: 0,
  repeat: Infinity,
  repeatType: 'mirror',
} as const;

/**
 * A holographic wash, like light across iridescent foil: broad pastel fields from round
 * the rainbow that overlap and melt into each other. Two layers drift past each other at
 * different speeds, so the blend keeps changing and never settles into a pattern.
 */
const WASHES = [
  'radial-gradient(38% 160% at 8% 40%, #f9c6a6, transparent 70%), radial-gradient(38% 160% at 40% 65%, #f2e397, transparent 70%), radial-gradient(38% 160% at 70% 35%, #b2daf3, transparent 70%), radial-gradient(38% 160% at 96% 60%, #c8bcf3, transparent 70%)',
  'radial-gradient(34% 150% at 24% 30%, #f1badb, transparent 70%), radial-gradient(34% 150% at 56% 55%, #b1e6c8, transparent 70%), radial-gradient(34% 150% at 86% 40%, #e9c3ea, transparent 70%)',
];

const DRIFTS = [
  {
    from: { x: '-9%', y: '-6%' },
    to: { x: '8%', y: '5%' },
    seconds: 11,
  },
  {
    from: { x: '7%', y: '6%' },
    to: { x: '-8%', y: '-5%' },
    seconds: 17,
  },
];

/**
 * The leaned record, named where it covers nothing: the strip under the stack, washed
 * in a pastel rainbow that drifts on its own so the eye finds it. The button carries
 * the accessible name, so this is for sighted readers only. Before anything is leaned
 * it says how.
 */
export function Readout({ leaning, wide }: { leaning: CollectionItem | null; wide: boolean }) {
  return (
    <div aria-hidden="true" className="relative shrink-0 overflow-hidden border-t border-rule">
      {/* Oversized layers, moved, never repainted: transform only. */}
      <div className="absolute inset-0 bg-[#eef0f7]" />
      {WASHES.map((background, i) => (
        <motion.div
          key={background}
          className={`absolute -inset-[45%] ${i === 1 ? 'opacity-75' : ''}`}
          style={{ background }}
          initial={DRIFTS[i]?.from}
          animate={DRIFTS[i]?.to}
          transition={{ ...drift, visualDuration: DRIFTS[i]?.seconds ?? 12 }}
        />
      ))}
      <p className="relative min-h-11 px-4 py-2 text-sm leading-tight md:px-6 md:py-3">
        {leaning ? (
          <>
            <span className="block font-semibold">{leaning.release.title}</span>
            <span className="block text-xs text-ink-soft">
              {leaning.release.artists.join(', ')}
              {leaning.release.year ? ` · ${String(leaning.release.year)}` : ''}
            </span>
          </>
        ) : (
          <span className="block pt-1.5 text-xs text-ink-soft">
            {wide ? 'Hover over a record to see what it is' : 'Tap a record to open it'}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * The holographic colours, like light across iridescent foil: broad pastel fields from
 * round the rainbow that overlap and melt into each other. One definition for the
 * readout strip, the liquid buttons and the glow behind a leaned cover.
 */

/** Cool white under the fields, so gaps between them read as foil, not paper. */
export const HOLO_GROUND = '#eef0f7';

/** Two layers of fields; drifting past each other they keep the blend changing. */
export const HOLO_WASHES = [
  'radial-gradient(38% 160% at 8% 40%, #f9c6a6, transparent 70%), radial-gradient(38% 160% at 40% 65%, #f2e397, transparent 70%), radial-gradient(38% 160% at 70% 35%, #b2daf3, transparent 70%), radial-gradient(38% 160% at 96% 60%, #c8bcf3, transparent 70%)',
  'radial-gradient(34% 150% at 24% 30%, #f1badb, transparent 70%), radial-gradient(34% 150% at 56% 55%, #b1e6c8, transparent 70%), radial-gradient(34% 150% at 86% 40%, #e9c3ea, transparent 70%)',
] as const;

/** The whole wash as one background, for small things that do not drift. */
export const HOLO_FILL = `${HOLO_WASHES[1]}, ${HOLO_WASHES[0]}, ${HOLO_GROUND}`;

/**
 * The same colours swept round a point, for a rim or a glow: every hue meets every
 * edge, where the linear fields would leave one side all one colour.
 */
export const HOLO_RING =
  'conic-gradient(from 210deg, #f9c6a6, #f2e397, #b1e6c8, #b2daf3, #c8bcf3, #f1badb, #f9c6a6)';

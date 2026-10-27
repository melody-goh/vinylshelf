import { Pause, Play } from 'lucide-react';
import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from 'motion/react';
import { HOLO_RING } from '../design/holo';

const press = { type: 'spring', stiffness: 500, damping: 28 } as const;
/** How fast the colours turn while playing: slow, like a label seen across the room. */
const DEGREES_PER_SECOND = 24;

/**
 * The play button: the holographic colours swept round a circle (the cover glow's
 * ring), with the icon in ink. While playing, the colours turn slowly like a record;
 * a constant turn, as a record does not ease. Under reduced motion they hold still.
 */
export function PlayButton({
  playing,
  label,
  onClick,
  disabled = false,
  size = 'md',
}: {
  playing: boolean;
  /** What is played: the button is named "Play …" or "Pause …". */
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
}) {
  const reduced = useReducedMotion() ?? false;
  const turn = useMotionValue(0);
  useAnimationFrame((_, delta) => {
    if (playing && !reduced) turn.set(turn.get() + (delta / 1000) * DEGREES_PER_SECOND);
  });
  const name = `${playing ? 'Pause' : 'Play'}${label ? ` ${label}` : ''}`;
  const icon = size === 'lg' ? 'size-6' : 'size-4';

  return (
    <motion.button
      type="button"
      aria-label={name}
      disabled={disabled}
      aria-busy={disabled || undefined}
      onClick={onClick}
      whileHover={disabled ? {} : { scale: 1.06 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      transition={press}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full text-ink shadow-photo disabled:opacity-50 ${size === 'lg' ? 'size-14' : 'size-11'}`}
    >
      <motion.span
        aria-hidden="true"
        className="absolute -inset-1 rounded-full"
        style={{
          background: HOLO_RING,
          rotate: turn,
        }}
      />
      {playing ? (
        <Pause aria-hidden="true" className={`relative fill-current ${icon}`} />
      ) : (
        <Play aria-hidden="true" className={`relative ml-0.5 fill-current ${icon}`} />
      )}
    </motion.button>
  );
}

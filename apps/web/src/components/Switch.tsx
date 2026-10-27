import { motion, useReducedMotion } from 'motion/react';
import { HOLO_FILL } from '../design/holo';

const slide = { type: 'spring', stiffness: 500, damping: 32 } as const;

/**
 * An on/off switch: a small pill whose ink knob slides across on a spring. Off, the
 * pill is a hairline on the ground; on, it fills with the holographic wash, the same
 * colours as the play button it works with.
 */
export function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        onChange(!on);
      }}
      className="flex items-center gap-3 text-sm"
    >
      <span className={on ? 'text-ink' : 'text-ink-soft'}>{label}</span>
      <span
        aria-hidden="true"
        className="relative h-5 w-9 overflow-hidden rounded-full border border-ink/30"
      >
        <motion.span
          className="absolute inset-0"
          style={{ background: HOLO_FILL }}
          initial={false}
          animate={{ opacity: on ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : slide}
        />
        <motion.span
          className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-ink shadow-disc"
          initial={false}
          animate={{ x: on ? 16 : 0 }}
          transition={reduce ? { duration: 0 } : slide}
        />
      </span>
    </button>
  );
}

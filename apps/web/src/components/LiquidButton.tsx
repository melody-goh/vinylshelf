import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from 'motion/react';
import { useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { HOLO_FILL } from '../design/holo';

/** Wobbly enough to read as liquid, damped enough to settle in about half a second. */
const liquid = { stiffness: 320, damping: 16, mass: 0.6 } as const;
const fade = { type: 'spring', stiffness: 260, damping: 30 } as const;
/** How far past its edge the button notices the pointer, so it can be pulled out. */
const REACH = 18;

type Fill = 'holo' | 'white';

/**
 * A pill that behaves like liquid: a blob follows the pointer and merges with the pill
 * through an SVG goo filter, so the edge bulges where the pointer pulls and snaps back
 * when it leaves. Only transform and opacity move; the filter itself is static.
 *
 * - `holo`: a light outlined pill at rest; on hover the holographic wash floods in, with
 *   a soft glow of the same colours.
 * - `white`: a white pill with ink text, for use on the holographic strip.
 *
 * Under reduced motion the blob stays still and only the fill changes.
 */
export function LiquidButton({
  fill = 'holo',
  children,
  className = '',
  disabled,
  ...props
}: Omit<HTMLMotionProps<'button'>, 'children'> & { fill?: Fill; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const goo = `goo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ref = useRef<HTMLButtonElement>(null);
  const [hot, setHot] = useState(false);
  const blobX = useSpring(useMotionValue(0), liquid);
  const blobY = useSpring(useMotionValue(0), liquid);

  const follow = (event: PointerEvent<HTMLSpanElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || reduced || disabled) return;
    // Offset of the pointer from the pill's centre, allowed a little past its edges.
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    blobX.set(Math.max(-rect.width / 2 - REACH, Math.min(rect.width / 2 + REACH, dx)));
    blobY.set(Math.max(-rect.height / 2 - REACH, Math.min(rect.height / 2 + REACH, dy)));
  };

  const release = () => {
    setHot(false);
    blobX.set(0);
    blobY.set(0);
  };

  const showFill = fill === 'white' || hot;
  const surface = fill === 'white' ? { backgroundColor: '#ffffff' } : { background: HOLO_FILL };

  return (
    // The wider span is the pointer's reach; the button inside is the target.
    <span
      className={`relative inline-flex ${className}`}
      onPointerEnter={() => {
        if (!disabled) setHot(true);
      }}
      onPointerMove={follow}
      onPointerLeave={release}
      style={{ padding: REACH, margin: -REACH }}
    >
      <svg aria-hidden="true" className="absolute size-0">
        <filter id={goo} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>

      <motion.button
        ref={ref}
        type="button"
        disabled={disabled}
        whileTap={disabled ? {} : { scale: 0.96 }}
        transition={fade}
        className="relative isolate inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm text-ink disabled:opacity-50"
        {...props}
      >
        {fill === 'holo' && (
          <>
            {/* The glow: the same colours, blurred out behind the pill. */}
            <motion.span
              aria-hidden="true"
              className="absolute -inset-3 -z-20 rounded-full blur-xl"
              style={{ background: HOLO_FILL }}
              animate={{ opacity: hot ? 0.7 : 0 }}
              transition={fade}
            />
            {/* At rest only a hairline shows. */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 -z-10 rounded-full ring-1 ring-ink/25 ring-inset"
              animate={{ opacity: hot ? 0 : 1 }}
              transition={fade}
            />
          </>
        )}
        {fill === 'white' && (
          // Outside the filter, whose alpha threshold would erase a soft shadow.
          <span aria-hidden="true" className="absolute inset-0 -z-20 rounded-full shadow-photo" />
        )}
        {/* The liquid: pill and blob, merged by the goo filter. */}
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{ filter: `url(#${goo})` }}
          animate={{ opacity: showFill ? 1 : 0 }}
          transition={fade}
        >
          <span className="absolute inset-0 rounded-full" style={surface} />
          <motion.span
            className="absolute left-1/2 top-1/2 aspect-square h-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ ...surface, x: blobX, y: blobY }}
          />
        </motion.span>
        <span className="relative">{children}</span>
      </motion.button>
    </span>
  );
}

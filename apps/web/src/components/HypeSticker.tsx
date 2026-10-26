import { motion } from 'motion/react';
import type { ReactNode } from 'react';

const press = { type: 'spring', stiffness: 500, damping: 28 } as const;

const STICKER =
  'condensed grid size-32 place-items-center rounded-full bg-sticker p-4 text-center text-sm font-bold leading-tight text-sticker-ink shadow-photo';

/**
 * The round sticker on a sleeve's shrink-wrap, used for the few primary actions (sign in,
 * import). Its own shape, so it never reads as a generic button.
 */
export function HypeSticker({
  children,
  href,
  onClick,
  disabled = false,
  className = '',
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const motionProps = {
    initial: { rotate: -8 },
    whileHover: disabled ? {} : { scale: 1.05, rotate: -4 },
    whileTap: disabled ? {} : { scale: 0.97 },
    transition: press,
  };

  if (href) {
    return (
      <motion.a href={href} className={`${STICKER} ${className}`} {...motionProps}>
        {children}
      </motion.a>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${STICKER} disabled:opacity-70 ${className}`}
      {...motionProps}
    >
      {children}
    </motion.button>
  );
}

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { scoreLetter, type NotePlacement } from '../design/scored';

/** How often the wave moves on by one letter, in ms. */
const TICK = 85;
/** How many letters are in notes at once. */
const WAVE = 4;
/** Ticks of plain type between passes of the wave. */
const REST = 10;

const bloom = { type: 'spring', stiffness: 520, damping: 22 } as const;
const settle = { type: 'spring', stiffness: 700, damping: 45 } as const;
/** Ticks a letter keeps its notes mounted after the wave leaves, to settle back. */
const LINGER = 4;

/** A filled note head, tilted as engraved. */
function Head({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={small ? 3.2 : 4.4}
      ry={small ? 2.3 : 3.1}
      transform={`rotate(-24 ${String(x)} ${String(y)})`}
    />
  );
}

/**
 * The notes, after the sheet in the brief: plain black, engraved shapes on a 24-unit
 * grid, stems up. Order matches NOTE_SHAPE in design/scored.ts.
 */
const NOTE_SHAPES = [
  // Crotchet.
  <>
    <Head x={8} y={19} />
    <rect x="11" y="2" width="1.4" height="17" />
  </>,
  // Quaver: a crotchet with a curved flag.
  <>
    <Head x={8} y={19} />
    <rect x="11" y="2" width="1.4" height="17" />
    <path d="M11 2h1.4c.2 2.6 1.8 4.2 3.2 6.2 1.2 1.7 2 3.4 2 5.4 0 1.4-.4 2.7-.9 3.8l-.9-.4c.4-1 .7-2 .7-3.2 0-3.4-2.9-5.6-4.1-6.6z" />
  </>,
  // Minim: an open head.
  <>
    <ellipse
      cx="8"
      cy="19"
      rx="3.7"
      ry="2.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      transform="rotate(-24 8 19)"
    />
    <rect x="11" y="2" width="1.4" height="17" />
  </>,
  // Beamed pair.
  <>
    <Head x={5.4} y={20} />
    <Head x={17} y={18.4} />
    <rect x="8.4" y="4" width="1.3" height="16" />
    <rect x="20" y="2.4" width="1.3" height="16" />
    <path d="M8.4 3.4 21.3 1.6v2.6L8.4 6z" />
  </>,
  // Beamed three.
  <>
    <Head small x={3.6} y={20.4} />
    <Head small x={11.2} y={19.4} />
    <Head small x={18.8} y={18.4} />
    <rect x="6.4" y="4.6" width="1.1" height="15.8" />
    <rect x="14" y="3.6" width="1.1" height="15.8" />
    <rect x="21.6" y="2.6" width="1.1" height="15.8" />
    <path d="M6.4 4 22.7 1.8v2.3L6.4 6.3z" />
  </>,
  // Flat.
  <>
    <rect x="7" y="1" width="1.5" height="21.5" />
    <path d="M8.5 14.2c1.6-1.7 3.6-2.4 5.1-1.4 1.8 1.2 1.4 3.6-.6 5.6l-4.5 4.1v-2.3l3.2-3.1c1.2-1.2 1.5-2.5.7-3.1-.9-.6-2.4-.2-3.9 1.4z" />
  </>,
];
/**
 * Loading type that breaks into music notes and comes back: a wave runs through the
 * words, letter by letter, each one scattering into a cluster of black notes that fill
 * its own shape before it settles back into type. Only for display-size text, where a
 * note is big enough to read as one. Screen readers get the plain text; under reduced
 * motion, so does everyone.
 */
export function ScoredText({ text, className = '' }: { text: string; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const sprite = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const letters = useRef<HTMLSpanElement>(null);
  const [scores, setScores] = useState<NotePlacement[][] | null>(null);
  const [front, setFront] = useState(0);

  const words = useMemo(() => {
    let index = 0;
    return text
      .split(' ')
      .map((word) => Array.from(word).map((char) => ({ char, index: index++ })));
  }, [text]);
  const count = words.reduce((n, word) => n + word.length, 0);

  // Score each letter once its font has loaded, from the letter as actually laid out.
  useEffect(() => {
    const root = letters.current;
    if (reduced || !root) return;
    let cancelled = false;
    void (document.fonts as FontFaceSet | undefined)?.ready.then(() => {
      if (cancelled) return;
      const style = getComputedStyle(root);
      const size = Number.parseFloat(style.fontSize);
      const spacing = Number.parseFloat(style.letterSpacing) || 0;
      const lineHeight = (Number.parseFloat(style.lineHeight) || size * 1.2) / size;
      const upper = style.textTransform === 'uppercase';
      const spans = root.querySelectorAll<HTMLElement>('[data-letter]');
      setScores(
        Array.from(spans, (span, i) => {
          const char = upper ? span.textContent.toUpperCase() : span.textContent;
          const advance = (span.getBoundingClientRect().width - spacing) / size;
          return scoreLetter(
            char,
            {
              family: style.fontFamily,
              weight: style.fontWeight,
              style: style.fontStyle,
              lineHeight,
              advance,
            },
            char.charCodeAt(0) * 131 + i,
          );
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [reduced, text]);

  // The wave front walks through the letters, rests a moment, and starts again.
  useEffect(() => {
    if (!scores) return;
    const id = window.setInterval(() => {
      setFront((f) => (f >= count + WAVE + REST ? 0 : f + 1));
    }, TICK);
    return () => {
      window.clearInterval(id);
    };
  }, [scores, count]);

  if (reduced) {
    return (
      <p role="status" className={className}>
        {text}
      </p>
    );
  }

  return (
    <p role="status" className={className}>
      <span className="sr-only">{text}</span>
      <svg aria-hidden="true" className="absolute size-0 overflow-hidden">
        {NOTE_SHAPES.map((shape, i) => (
          <symbol key={i} id={`${sprite}-${String(i)}`} viewBox="0 0 24 24" fill="currentColor">
            {shape}
          </symbol>
        ))}
      </svg>
      <span ref={letters} aria-hidden="true">
        {words.map((word, w) => (
          <span key={w}>
            {w > 0 && ' '}
            <span className="inline-block whitespace-nowrap">
              {word.map(({ char, index }) => (
                <Letter
                  key={index}
                  char={char}
                  notes={scores?.[index]}
                  scored={index <= front && index > front - WAVE}
                  live={index <= front + 1 && index > front - WAVE - LINGER}
                  sprite={sprite}
                />
              ))}
            </span>
          </span>
        ))}
      </span>
    </p>
  );
}

function Letter({
  char,
  notes,
  scored,
  live,
  sprite,
}: {
  char: string;
  notes: NotePlacement[] | undefined;
  scored: boolean;
  /** Near the wave: only these letters keep notes mounted, to spare the page. */
  live: boolean;
  sprite: string;
}) {
  const showNotes = scored && notes !== undefined && notes.length > 0;
  return (
    <span data-letter className="relative inline-block">
      <motion.span
        className="inline-block"
        animate={{ opacity: showNotes ? 0 : 1 }}
        transition={settle}
      >
        {char}
      </motion.span>
      {live && notes && notes.length > 0 && (
        <motion.span
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={showNotes ? 'scored' : 'type'}
          variants={{
            scored: { transition: { staggerChildren: 0.0025 } },
            type: { transition: { staggerChildren: 0.0015, staggerDirection: -1 } },
          }}
        >
          {notes.map((note, k) => (
            <motion.svg
              key={k}
              viewBox="0 0 24 24"
              className="absolute"
              style={{
                left: `${String(note.x - note.size / 2)}em`,
                top: `${String(note.y - note.size / 2)}em`,
                width: `${String(note.size)}em`,
                height: `${String(note.size)}em`,
              }}
              variants={{
                scored: { opacity: 1, scale: 1, rotate: note.rotate, y: 0 },
                type: { opacity: 0, scale: 0.3, rotate: 0, y: '0.08em' },
              }}
              transition={bloom}
            >
              <use href={`#${sprite}-${String(note.shape)}`} />
            </motion.svg>
          ))}
        </motion.span>
      )}
    </span>
  );
}

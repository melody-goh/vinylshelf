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

/** Drawn notes on a 24-unit grid, filled with the text colour. */
const NOTE_SHAPES = [
  // Crotchet: head and stem.
  'M12.4 3h1.6v15.2c0 2.6-2.6 4.6-5.6 4.6-2.2 0-3.6-1.1-3.6-2.8 0-2.5 2.7-4.4 5.6-4.4.8 0 1.5.1 2 .4z',
  // Quaver: head, stem and flag.
  'M10.4 3h1.6v15.2c0 2.6-2.6 4.6-5.6 4.6C4.2 22.8 2.8 21.7 2.8 20c0-2.5 2.7-4.4 5.6-4.4.8 0 1.5.1 2 .4zM12 3c0 3.2 6 4.6 6 9.8 0 1.6-.5 3-1.3 4 .4-3.6-1.6-6.4-4.7-7.2z',
  // Beamed pair: two heads, two stems, one beam.
  'M7.2 6.2 20.8 3v14.4c0 2.2-2.2 3.9-4.7 3.9-1.8 0-3-1-3-2.4 0-2.1 2.3-3.7 4.7-3.7.6 0 1.1.1 1.5.3V8.4L8.8 10.6v8.8c0 2.2-2.2 3.9-4.7 3.9-1.8 0-3-1-3-2.4 0-2.1 2.3-3.7 4.7-3.7.6 0 1.1.1 1.5.3z',
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
        {NOTE_SHAPES.map((d, i) => (
          <symbol key={d} id={`${sprite}-${String(i)}`} viewBox="0 0 24 24">
            <path d={d} fill="currentColor" />
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

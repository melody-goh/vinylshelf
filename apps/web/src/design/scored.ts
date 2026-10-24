/**
 * Where the music notes go when a letter of loading type breaks into notes: points
 * inside the glyph's own ink, found by drawing it once to a canvas in the page's font.
 * Positions are in em, so they hold at any font size. Seeded per letter, so a word
 * scores the same way every time it appears.
 */

export interface NotePlacement {
  /** Centre, in em from the letter box's top left. */
  x: number;
  y: number;
  /** Width and height, in em. */
  size: number;
  /** Resting tilt, in degrees. */
  rotate: number;
  /** Which drawn note: crotchet, quaver or beamed pair. */
  shape: 0 | 1 | 2;
}

export interface LetterFont {
  /** The computed CSS font family, weight and style of the text. */
  family: string;
  weight: string;
  style: string;
  /** Line height in em: where the baseline sits inside the letter box. */
  lineHeight: number;
  /** The letter's advance in em as laid out, without letter-spacing. */
  advance: number;
}

/** Canvas font size for sampling; large enough that thin strokes still catch points. */
const PX = 160;
/** Grid spacing between candidate notes, in em; jittered so no grid shows. */
const STEP = 0.068;
const MAX_NOTES = 70;

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scoreLetter(char: string, font: LetterFont, seed: number): NotePlacement[] {
  if (!char.trim()) return [];
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];

  const setFont = () => {
    context.font = `${font.style} ${font.weight} ${String(PX)}px ${font.family}`;
  };
  setFont();
  const metrics = context.measureText(char);
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  if (!metrics.width || !ascent) return [];

  const pad = Math.ceil(PX * 0.1);
  canvas.width = Math.ceil(metrics.width) + pad * 2;
  canvas.height = Math.ceil(ascent + descent) + pad * 2;
  setFont(); // resizing a canvas resets its state
  context.fillText(char, pad, pad + ascent);
  const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);

  // The canvas cannot always set font-stretch, so the sampled glyph is scaled to the
  // letter's real width; the baseline is placed as CSS centres the font in its line box.
  const stretch = font.advance / (metrics.width / PX);
  const baseline = (font.lineHeight - (ascent + descent) / PX) / 2 + ascent / PX;

  const random = seeded(seed);
  const step = STEP * PX;
  const notes: NotePlacement[] = [];
  for (let gy = step / 2; gy < canvas.height; gy += step * 0.86) {
    for (let gx = step / 2; gx < canvas.width; gx += step) {
      const x = Math.round(gx + (random() - 0.5) * step * 0.7);
      const y = Math.round(gy + (random() - 0.5) * step * 0.7);
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha < 160) continue;
      notes.push({
        x: ((x - pad) / PX) * stretch,
        y: baseline + (y - pad - ascent) / PX,
        size: 0.11 + random() * 0.06,
        rotate: -24 + random() * 48,
        shape: Math.floor(random() * 3) as 0 | 1 | 2,
      });
    }
  }

  // Thin out evenly rather than truncating, so a large letter is not filled top-first.
  while (notes.length > MAX_NOTES) notes.splice(Math.floor(random() * notes.length), 1);
  // Shuffled, so a letter blooms all over at once rather than from the top down.
  for (let i = notes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [notes[i], notes[j]] = [notes[j] as NotePlacement, notes[i] as NotePlacement];
  }
  return notes;
}

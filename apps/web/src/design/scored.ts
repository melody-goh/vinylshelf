/**
 * Where the music notes go when a letter of loading type breaks into notes: a few
 * well-spaced points inside the glyph's own ink, found by drawing it once to a canvas in
 * the page's font, each with a drift that carries it a little outside the letter.
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
  /** Which drawn note, as an index into NOTE_SHAPE. */
  shape: number;
  /** Where it drifts to while scored, in em from (x, y): away from the letter's centre. */
  driftX: number;
  driftY: number;
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
/** Grid spacing between candidate points, in em: fine, so thin strokes are found. */
const STEP = 0.04;
/**
 * Closest two notes may sit, in em. Wide enough that each reads as a note rather than
 * a speck in a fill.
 */
const MIN_GAP = 0.2;
const MAX_NOTES = 9;

/**
 * How often each drawn note appears (components/ScoredText.tsx draws them in this
 * order): mostly single notes, a few beamed groups and flats for texture.
 */
const NOTE_SHAPE = [
  { name: 'crotchet', weight: 0.26 },
  { name: 'quaver', weight: 0.26 },
  { name: 'minim', weight: 0.14 },
  { name: 'beamed pair', weight: 0.14 },
  { name: 'beamed three', weight: 0.08 },
  { name: 'flat', weight: 0.12 },
];

function pickShape(r: number): number {
  let sum = 0;
  for (const [i, shape] of NOTE_SHAPE.entries()) {
    sum += shape.weight;
    if (r < sum) return i;
  }
  return 0;
}

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
  const inked: { x: number; y: number }[] = [];
  for (let gy = step / 2; gy < canvas.height; gy += step) {
    for (let gx = step / 2; gx < canvas.width; gx += step) {
      const alpha = data[(Math.round(gy) * width + Math.round(gx)) * 4 + 3] ?? 0;
      if (alpha >= 160)
        inked.push({ x: ((gx - pad) / PX) * stretch, y: baseline + (gy - pad - ascent) / PX });
    }
  }
  if (inked.length === 0) return [];

  // The letter's centre of ink, which notes drift away from.
  const cx = inked.reduce((sum, p) => sum + p.x, 0) / inked.length;
  const cy = inked.reduce((sum, p) => sum + p.y, 0) / inked.length;

  // Shuffle, then keep points that are far enough from every point kept so far: an even,
  // loose scatter over the letter, and a bloom order that is not top-down.
  for (let i = inked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [inked[i], inked[j]] = [inked[j] as (typeof inked)[number], inked[i] as (typeof inked)[number]];
  }
  const notes: NotePlacement[] = [];
  for (const point of inked) {
    if (notes.length >= MAX_NOTES) break;
    if (notes.some((n) => Math.hypot(n.x - point.x, n.y - point.y) < MIN_GAP)) continue;
    const away = Math.atan2(point.y - cy, point.x - cx) + (random() - 0.5) * 0.9;
    const reach = 0.03 + random() * 0.07;
    notes.push({
      x: point.x,
      y: point.y,
      size: 0.24 + random() * 0.1,
      rotate: -18 + random() * 36,
      shape: pickShape(random()),
      driftX: Math.cos(away) * reach,
      driftY: Math.sin(away) * reach - 0.015,
    });
  }
  return notes;
}
